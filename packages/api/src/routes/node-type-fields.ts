import { Hono } from "hono";
import { generateId } from "../lib/id.js";
import { generateUniqueSlug } from "../lib/slug.js";
import { errorResponse } from "../lib/errors.js";
import type { Bindings } from "../index.js";

const FIELD_TYPES = [
  "text",
  "number",
  "boolean",
  "date",
  "url",
  "email",
  "select",
  "multi_select",
] as const;

type NodeTypeRow = {
  id: string;
  graph_id: string;
  name: string;
  slug: string;
  color: string | null;
  icon: string | null;
  display_field_slug: string | null;
  created_at: string;
  updated_at: string;
};

const nodeTypeFields = new Hono<{ Bindings: Bindings }>();

/**
 * Middleware: validate the parent node type exists and belongs to the graph.
 * Stores the node type on the context for downstream handlers.
 */
nodeTypeFields.use("*", async (c, next) => {
  const graph = c.get("graph");
  const nodeTypeId = c.req.param("nodeTypeId");

  const nodeType = await c.env.DB.prepare(
    "SELECT id, graph_id, name, slug, color, icon, display_field_slug, created_at, updated_at FROM node_types WHERE id = ? AND graph_id = ?",
  )
    .bind(nodeTypeId, graph.id)
    .first<NodeTypeRow>();

  if (!nodeType) {
    return errorResponse(c, 404, "Node type not found");
  }

  c.set("nodeType" as never, nodeType as never);
  return next();
});

// POST / — create a field on this node type
nodeTypeFields.post("/", async (c) => {
  const nodeType = c.get("nodeType" as never) as unknown as NodeTypeRow;

  const body = await c.req.json<{
    name?: string;
    field_type?: string;
    ordinal?: number;
    required?: boolean;
    config?: Record<string, unknown>;
  }>();

  // Validate name
  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    return errorResponse(c, 400, "Field name is required");
  }

  // Validate field_type
  if (
    !body.field_type ||
    !(FIELD_TYPES as readonly string[]).includes(body.field_type)
  ) {
    return errorResponse(
      c,
      400,
      `Invalid field_type. Must be one of: ${FIELD_TYPES.join(", ")}`,
    );
  }

  // Validate ordinal
  if (body.ordinal === undefined || typeof body.ordinal !== "number") {
    return errorResponse(c, 400, "Ordinal is required and must be a number");
  }

  // For select/multi_select, config must have options array
  const config = body.config ?? {};
  if (
    body.field_type === "select" ||
    body.field_type === "multi_select"
  ) {
    const options = (config as Record<string, unknown>).options;
    if (
      !Array.isArray(options) ||
      options.length === 0 ||
      !options.every((o) => typeof o === "string")
    ) {
      return errorResponse(
        c,
        400,
        "select and multi_select fields require a config.options array with at least one string",
      );
    }
  }

  // Check field name uniqueness within node type
  const existingByName = await c.env.DB.prepare(
    "SELECT id FROM node_type_fields WHERE node_type_id = ? AND name = ?",
  )
    .bind(nodeType.id, body.name.trim())
    .first();

  if (existingByName) {
    return errorResponse(
      c,
      409,
      "A field with this name already exists on this node type",
    );
  }

  // Generate unique slug
  const existingSlugs = await c.env.DB.prepare(
    "SELECT slug FROM node_type_fields WHERE node_type_id = ?",
  )
    .bind(nodeType.id)
    .all<{ slug: string }>();

  const slug = generateUniqueSlug(
    body.name,
    existingSlugs.results.map((r) => r.slug),
  );

  const id = generateId();
  const now = new Date().toISOString();
  const required = body.required ? 1 : 0;

  await c.env.DB.prepare(
    "INSERT INTO node_type_fields (id, node_type_id, name, slug, field_type, ordinal, required, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      id,
      nodeType.id,
      body.name.trim(),
      slug,
      body.field_type,
      body.ordinal,
      required,
      JSON.stringify(config),
      now,
      now,
    )
    .run();

  return c.json(
    {
      data: {
        id,
        node_type_id: nodeType.id,
        name: body.name.trim(),
        slug,
        field_type: body.field_type,
        ordinal: body.ordinal,
        required: !!required,
        config,
        created_at: now,
        updated_at: now,
      },
    },
    201,
  );
});

// PATCH /:fieldId — update a field
nodeTypeFields.patch("/:fieldId", async (c) => {
  const nodeType = c.get("nodeType" as never) as unknown as NodeTypeRow;
  const fieldId = c.req.param("fieldId");

  const field = await c.env.DB.prepare(
    "SELECT id, node_type_id, name, slug, field_type, ordinal, required, config, created_at, updated_at FROM node_type_fields WHERE id = ? AND node_type_id = ?",
  )
    .bind(fieldId, nodeType.id)
    .first<{
      id: string;
      node_type_id: string;
      name: string;
      slug: string;
      field_type: string;
      ordinal: number;
      required: number;
      config: string;
      created_at: string;
      updated_at: string;
    }>();

  if (!field) {
    return errorResponse(c, 404, "Field not found");
  }

  const body = await c.req.json<{
    name?: string;
    field_type?: string;
    ordinal?: number;
    required?: boolean;
    config?: Record<string, unknown>;
  }>();

  // field_type is immutable
  if (body.field_type !== undefined) {
    return errorResponse(c, 400, "Field type is immutable");
  }

  // Check name uniqueness (excluding current field)
  if (body.name !== undefined) {
    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      return errorResponse(c, 400, "Field name cannot be empty");
    }

    const duplicate = await c.env.DB.prepare(
      "SELECT id FROM node_type_fields WHERE node_type_id = ? AND name = ? AND id != ?",
    )
      .bind(nodeType.id, body.name.trim(), fieldId)
      .first();

    if (duplicate) {
      return errorResponse(
        c,
        409,
        "A field with this name already exists on this node type",
      );
    }
  }

  // If changing required to true, check for existing nodes
  if (body.required === true && field.required === 0) {
    const nodeCount = await c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM nodes WHERE node_type_id = ?",
    )
      .bind(nodeType.id)
      .first<{ count: number }>();

    if (nodeCount && nodeCount.count > 0) {
      return errorResponse(
        c,
        400,
        "Cannot make field required when nodes of this type exist",
      );
    }
  }

  // Validate config for select/multi_select if provided
  if (body.config !== undefined) {
    if (
      field.field_type === "select" ||
      field.field_type === "multi_select"
    ) {
      const options = body.config.options;
      if (
        !Array.isArray(options) ||
        options.length === 0 ||
        !options.every((o) => typeof o === "string")
      ) {
        return errorResponse(
          c,
          400,
          "select and multi_select fields require a config.options array with at least one string",
        );
      }
    }
  }

  const name =
    body.name !== undefined ? body.name.trim() : field.name;
  const ordinal =
    body.ordinal !== undefined ? body.ordinal : field.ordinal;
  const required =
    body.required !== undefined ? (body.required ? 1 : 0) : field.required;
  const config =
    body.config !== undefined
      ? JSON.stringify(body.config)
      : field.config;

  const now = new Date().toISOString();

  await c.env.DB.prepare(
    "UPDATE node_type_fields SET name = ?, ordinal = ?, required = ?, config = ?, updated_at = ? WHERE id = ?",
  )
    .bind(name, ordinal, required, config, now, fieldId)
    .run();

  return c.json({
    data: {
      id: field.id,
      node_type_id: field.node_type_id,
      name,
      slug: field.slug,
      field_type: field.field_type,
      ordinal,
      required: !!required,
      config: JSON.parse(typeof config === "string" ? config : JSON.stringify(config)),
      created_at: field.created_at,
      updated_at: now,
    },
  });
});

// DELETE /:fieldId — delete a field and prune from node data
nodeTypeFields.delete("/:fieldId", async (c) => {
  const nodeType = c.get("nodeType" as never) as unknown as NodeTypeRow;
  const fieldId = c.req.param("fieldId");

  const field = await c.env.DB.prepare(
    "SELECT id, slug FROM node_type_fields WHERE id = ? AND node_type_id = ?",
  )
    .bind(fieldId, nodeType.id)
    .first<{ id: string; slug: string }>();

  if (!field) {
    return errorResponse(c, 404, "Field not found");
  }

  // Delete the field
  await c.env.DB.prepare("DELETE FROM node_type_fields WHERE id = ?")
    .bind(fieldId)
    .run();

  // Prune the field slug from node data JSON
  const nodes = await c.env.DB.prepare(
    "SELECT id, data FROM nodes WHERE node_type_id = ?",
  )
    .bind(nodeType.id)
    .all<{ id: string; data: string }>();

  const updates = nodes.results.map((node) => {
    const data = JSON.parse(node.data);
    delete data[field.slug];
    return c.env.DB.prepare("UPDATE nodes SET data = ? WHERE id = ?").bind(
      JSON.stringify(data),
      node.id,
    );
  });

  if (updates.length > 0) {
    await c.env.DB.batch(updates);
  }

  // If the deleted field's slug matches display_field_slug, set to NULL
  if (nodeType.display_field_slug === field.slug) {
    await c.env.DB.prepare(
      "UPDATE node_types SET display_field_slug = NULL, updated_at = ? WHERE id = ?",
    )
      .bind(new Date().toISOString(), nodeType.id)
      .run();
  }

  return c.body(null, 204);
});

export { nodeTypeFields };

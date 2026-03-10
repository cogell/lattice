import { Hono } from "hono";
import { generateId } from "../lib/id.js";
import { errorResponse } from "../lib/errors.js";
import { generateUniqueSlug } from "../lib/slug.js";
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

type FieldType = (typeof FIELD_TYPES)[number];

const edgeTypeFields = new Hono<{ Bindings: Bindings }>();

/**
 * Validate that the parent edge type exists in the current graph.
 * Returns the edge type row or null.
 */
async function getEdgeType(db: D1Database, graphId: string, edgeTypeId: string) {
  return db.prepare(
    "SELECT id, graph_id, name, slug FROM edge_types WHERE id = ? AND graph_id = ?",
  )
    .bind(edgeTypeId, graphId)
    .first<{ id: string; graph_id: string; name: string; slug: string }>();
}

// GET / — list all fields for this edge type
edgeTypeFields.get("/", async (c) => {
  const edgeTypeId = c.req.param("edgeTypeId")!;
  const graph = c.get("graph");

  const edgeType = await getEdgeType(c.env.DB, graph.id, edgeTypeId);
  if (!edgeType) {
    return errorResponse(c, 404, "Edge type not found");
  }

  const result = await c.env.DB.prepare(
    "SELECT id, edge_type_id, name, slug, field_type, ordinal, required, config, created_at, updated_at FROM edge_type_fields WHERE edge_type_id = ? ORDER BY ordinal ASC",
  )
    .bind(edgeTypeId)
    .all<{
      id: string;
      edge_type_id: string;
      name: string;
      slug: string;
      field_type: string;
      ordinal: number;
      required: number;
      config: string;
      created_at: string;
      updated_at: string;
    }>();

  const fields = result.results.map((f) => ({
    ...f,
    required: !!f.required,
    config: JSON.parse(f.config || "{}"),
  }));

  return c.json({ data: fields });
});

// POST /:edgeTypeId/fields — add a field to an edge type
edgeTypeFields.post("/", async (c) => {
  const edgeTypeId = c.req.param("edgeTypeId")!;
  const graph = c.get("graph");

  const edgeType = await getEdgeType(c.env.DB, graph.id, edgeTypeId);
  if (!edgeType) {
    return errorResponse(c, 404, "Edge type not found");
  }

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
  if (!body.field_type || !FIELD_TYPES.includes(body.field_type as FieldType)) {
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

  // Validate config for select/multi_select
  const config = body.config || {};
  if (body.field_type === "select" || body.field_type === "multi_select") {
    if (
      !config.options ||
      !Array.isArray(config.options) ||
      config.options.length === 0 ||
      !config.options.every((opt: unknown) => typeof opt === "string")
    ) {
      return errorResponse(
        c,
        400,
        "select and multi_select fields require config.options array with at least one string",
      );
    }
  }

  // Check field name uniqueness within edge type
  const existingByName = await c.env.DB.prepare(
    "SELECT id FROM edge_type_fields WHERE edge_type_id = ? AND name = ?",
  )
    .bind(edgeTypeId, body.name.trim())
    .first();

  if (existingByName) {
    return errorResponse(c, 409, "A field with this name already exists on this edge type");
  }

  // Generate unique slug
  const existingSlugs = await c.env.DB.prepare(
    "SELECT slug FROM edge_type_fields WHERE edge_type_id = ?",
  )
    .bind(edgeTypeId)
    .all<{ slug: string }>();

  const slug = generateUniqueSlug(
    body.name,
    existingSlugs.results.map((r) => r.slug),
  );

  const id = generateId();
  const now = new Date().toISOString();
  const required = body.required ? 1 : 0;

  await c.env.DB.prepare(
    "INSERT INTO edge_type_fields (id, edge_type_id, name, slug, field_type, ordinal, required, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      id,
      edgeTypeId,
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
        edge_type_id: edgeTypeId,
        name: body.name.trim(),
        slug,
        field_type: body.field_type,
        ordinal: body.ordinal,
        required: required === 1,
        config,
        created_at: now,
        updated_at: now,
      },
    },
    201,
  );
});

// PATCH /:edgeTypeId/fields/:fieldId — update field
edgeTypeFields.patch("/:fieldId", async (c) => {
  const edgeTypeId = c.req.param("edgeTypeId")!;
  const fieldId = c.req.param("fieldId");
  const graph = c.get("graph");

  const edgeType = await getEdgeType(c.env.DB, graph.id, edgeTypeId);
  if (!edgeType) {
    return errorResponse(c, 404, "Edge type not found");
  }

  const field = await c.env.DB.prepare(
    "SELECT id, edge_type_id, name, slug, field_type, ordinal, required, config, created_at, updated_at FROM edge_type_fields WHERE id = ? AND edge_type_id = ?",
  )
    .bind(fieldId, edgeTypeId)
    .first<{
      id: string;
      edge_type_id: string;
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

  // Resolve new values
  const name = body.name !== undefined ? body.name.trim() : field.name;
  if (!name) {
    return errorResponse(c, 400, "Field name cannot be empty");
  }

  const ordinal = body.ordinal !== undefined ? body.ordinal : field.ordinal;
  const config = body.config !== undefined ? body.config : JSON.parse(field.config);
  const requiredValue = body.required !== undefined ? body.required : field.required === 1;

  // If changing required to true, check for existing edges
  if (body.required === true && field.required === 0) {
    const edgeCount = await c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM edges WHERE edge_type_id = ?",
    )
      .bind(edgeTypeId)
      .first<{ count: number }>();

    if (edgeCount && edgeCount.count > 0) {
      return errorResponse(
        c,
        400,
        "Cannot make field required when edges of this type exist",
      );
    }
  }

  // Check field name uniqueness (excluding current field)
  if (body.name !== undefined) {
    const existingByName = await c.env.DB.prepare(
      "SELECT id FROM edge_type_fields WHERE edge_type_id = ? AND name = ? AND id != ?",
    )
      .bind(edgeTypeId, name, fieldId)
      .first();

    if (existingByName) {
      return errorResponse(c, 409, "A field with this name already exists on this edge type");
    }
  }

  const now = new Date().toISOString();

  await c.env.DB.prepare(
    "UPDATE edge_type_fields SET name = ?, ordinal = ?, required = ?, config = ?, updated_at = ? WHERE id = ?",
  )
    .bind(name, ordinal, requiredValue ? 1 : 0, JSON.stringify(config), now, fieldId)
    .run();

  return c.json({
    data: {
      id: field.id,
      edge_type_id: field.edge_type_id,
      name,
      slug: field.slug,
      field_type: field.field_type,
      ordinal,
      required: requiredValue,
      config,
      created_at: field.created_at,
      updated_at: now,
    },
  });
});

// DELETE /:edgeTypeId/fields/:fieldId — delete field and prune from edge data
edgeTypeFields.delete("/:fieldId", async (c) => {
  const edgeTypeId = c.req.param("edgeTypeId")!;
  const fieldId = c.req.param("fieldId");
  const graph = c.get("graph");

  const edgeType = await getEdgeType(c.env.DB, graph.id, edgeTypeId);
  if (!edgeType) {
    return errorResponse(c, 404, "Edge type not found");
  }

  const field = await c.env.DB.prepare(
    "SELECT id, slug FROM edge_type_fields WHERE id = ? AND edge_type_id = ?",
  )
    .bind(fieldId, edgeTypeId)
    .first<{ id: string; slug: string }>();

  if (!field) {
    return errorResponse(c, 404, "Field not found");
  }

  // Delete the field definition
  await c.env.DB.prepare("DELETE FROM edge_type_fields WHERE id = ?").bind(fieldId).run();

  // Prune the field slug from edge data JSON
  const edges = await c.env.DB.prepare(
    "SELECT id, data FROM edges WHERE edge_type_id = ?",
  )
    .bind(edgeTypeId)
    .all<{ id: string; data: string }>();

  const updates = edges.results.map((edge) => {
    const data = JSON.parse(edge.data as string);
    delete data[field.slug];
    return c.env.DB.prepare("UPDATE edges SET data = ? WHERE id = ?").bind(
      JSON.stringify(data),
      edge.id,
    );
  });

  if (updates.length > 0) {
    await c.env.DB.batch(updates);
  }

  return c.body(null, 204);
});

export { edgeTypeFields };

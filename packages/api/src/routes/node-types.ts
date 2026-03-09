import { Hono } from "hono";
import { generateId } from "../lib/id.js";
import { errorResponse } from "../lib/errors.js";
import { generateUniqueSlug } from "../lib/slug.js";
import { nodeTypeFields } from "./node-type-fields.js";
import type { Bindings } from "../index.js";

const nodeTypes = new Hono<{ Bindings: Bindings }>();

// POST / — create a new node type
nodeTypes.post("/", async (c) => {
  const graph = c.get("graph");
  const body = await c.req.json<{
    name?: string;
    color?: string;
    icon?: string;
  }>();

  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    return errorResponse(c, 400, "Node type name is required");
  }

  const name = body.name.trim();

  // Check uniqueness of name within graph
  const existing = await c.env.DB.prepare(
    "SELECT id FROM node_types WHERE graph_id = ? AND name = ?",
  )
    .bind(graph.id, name)
    .first();

  if (existing) {
    return errorResponse(c, 409, "A node type with this name already exists in this graph");
  }

  // Generate unique slug
  const allSlugs = await c.env.DB.prepare(
    "SELECT slug FROM node_types WHERE graph_id = ?",
  )
    .bind(graph.id)
    .all<{ slug: string }>();

  const slug = generateUniqueSlug(
    name,
    allSlugs.results.map((r) => r.slug),
  );

  const id = generateId();
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    "INSERT INTO node_types (id, graph_id, name, slug, color, icon, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      id,
      graph.id,
      name,
      slug,
      body.color?.trim() || null,
      body.icon?.trim() || null,
      now,
      now,
    )
    .run();

  return c.json(
    {
      data: {
        id,
        graph_id: graph.id,
        name,
        slug,
        color: body.color?.trim() || null,
        icon: body.icon?.trim() || null,
        display_field_slug: null,
        created_at: now,
        updated_at: now,
      },
    },
    201,
  );
});

// GET / — list all node types for graph
nodeTypes.get("/", async (c) => {
  const graph = c.get("graph");

  const result = await c.env.DB.prepare(
    "SELECT id, graph_id, name, slug, color, icon, display_field_slug, created_at, updated_at FROM node_types WHERE graph_id = ? ORDER BY created_at ASC",
  )
    .bind(graph.id)
    .all();

  return c.json({ data: result.results });
});

// GET /:nodeTypeId — get single node type
nodeTypes.get("/:nodeTypeId", async (c) => {
  const graph = c.get("graph");
  const nodeTypeId = c.req.param("nodeTypeId");

  const nodeType = await c.env.DB.prepare(
    "SELECT id, graph_id, name, slug, color, icon, display_field_slug, created_at, updated_at FROM node_types WHERE id = ? AND graph_id = ?",
  )
    .bind(nodeTypeId, graph.id)
    .first();

  if (!nodeType) {
    return errorResponse(c, 404, "Node type not found");
  }

  return c.json({ data: nodeType });
});

// PATCH /:nodeTypeId — update node type
nodeTypes.patch("/:nodeTypeId", async (c) => {
  const graph = c.get("graph");
  const nodeTypeId = c.req.param("nodeTypeId");

  const nodeType = await c.env.DB.prepare(
    "SELECT id, graph_id, name, slug, color, icon, display_field_slug, created_at, updated_at FROM node_types WHERE id = ? AND graph_id = ?",
  )
    .bind(nodeTypeId, graph.id)
    .first<{
      id: string;
      graph_id: string;
      name: string;
      slug: string;
      color: string | null;
      icon: string | null;
      display_field_slug: string | null;
      created_at: string;
      updated_at: string;
    }>();

  if (!nodeType) {
    return errorResponse(c, 404, "Node type not found");
  }

  const body = await c.req.json<{
    name?: string;
    color?: string | null;
    icon?: string | null;
    display_field_slug?: string | null;
  }>();

  const name =
    body.name !== undefined ? body.name.trim() : nodeType.name;
  const color =
    body.color !== undefined
      ? body.color?.trim() || null
      : nodeType.color;
  const icon =
    body.icon !== undefined ? body.icon?.trim() || null : nodeType.icon;

  if (!name) {
    return errorResponse(c, 400, "Node type name cannot be empty");
  }

  // Check name uniqueness (exclude current node type)
  if (body.name !== undefined && name !== nodeType.name) {
    const duplicate = await c.env.DB.prepare(
      "SELECT id FROM node_types WHERE graph_id = ? AND name = ? AND id != ?",
    )
      .bind(graph.id, name, nodeTypeId)
      .first();

    if (duplicate) {
      return errorResponse(
        c,
        409,
        "A node type with this name already exists in this graph",
      );
    }
  }

  // Handle display_field_slug
  let displayFieldSlug = nodeType.display_field_slug;
  if ("display_field_slug" in body) {
    if (body.display_field_slug === null) {
      displayFieldSlug = null;
    } else if (body.display_field_slug !== undefined) {
      // Validate that the field exists on this node type
      const field = await c.env.DB.prepare(
        "SELECT id FROM node_type_fields WHERE node_type_id = ? AND slug = ?",
      )
        .bind(nodeTypeId, body.display_field_slug)
        .first();

      if (!field) {
        return errorResponse(
          c,
          400,
          `Field with slug "${body.display_field_slug}" does not exist on this node type`,
        );
      }
      displayFieldSlug = body.display_field_slug;
    }
  }

  const now = new Date().toISOString();

  await c.env.DB.prepare(
    "UPDATE node_types SET name = ?, color = ?, icon = ?, display_field_slug = ?, updated_at = ? WHERE id = ?",
  )
    .bind(name, color, icon, displayFieldSlug, now, nodeTypeId)
    .run();

  return c.json({
    data: {
      id: nodeType.id,
      graph_id: nodeType.graph_id,
      name,
      slug: nodeType.slug,
      color,
      icon,
      display_field_slug: displayFieldSlug,
      created_at: nodeType.created_at,
      updated_at: now,
    },
  });
});

// DELETE /:nodeTypeId — delete node type (FK CASCADE handles nodes/edges)
nodeTypes.delete("/:nodeTypeId", async (c) => {
  const graph = c.get("graph");
  const nodeTypeId = c.req.param("nodeTypeId");

  const nodeType = await c.env.DB.prepare(
    "SELECT id FROM node_types WHERE id = ? AND graph_id = ?",
  )
    .bind(nodeTypeId, graph.id)
    .first();

  if (!nodeType) {
    return errorResponse(c, 404, "Node type not found");
  }

  await c.env.DB.prepare("DELETE FROM node_types WHERE id = ?")
    .bind(nodeTypeId)
    .run();

  return c.body(null, 204);
});

// Sub-route: fields under /:nodeTypeId/fields
nodeTypes.route("/:nodeTypeId/fields", nodeTypeFields);

export { nodeTypes };

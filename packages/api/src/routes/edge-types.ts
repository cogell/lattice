import { Hono } from "hono";
import { generateId } from "../lib/id.js";
import { errorResponse } from "../lib/errors.js";
import { generateUniqueSlug } from "../lib/slug.js";
import { edgeTypeFields } from "./edge-type-fields.js";
import type { Bindings } from "../index.js";

type EdgeTypeRow = {
  id: string;
  graph_id: string;
  name: string;
  slug: string;
  directed: number;
  color: string | null;
  source_node_type_id: string;
  target_node_type_id: string;
  created_at: string;
  updated_at: string;
};

const edgeTypes = new Hono<{ Bindings: Bindings }>();

// POST / — create a new edge type
edgeTypes.post("/", async (c) => {
  const graph = c.get("graph");
  const body = await c.req.json<{
    name?: string;
    directed?: boolean;
    color?: string;
    source_node_type_id?: string;
    target_node_type_id?: string;
  }>();

  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    return errorResponse(c, 400, "Edge type name is required");
  }

  if (!body.source_node_type_id || typeof body.source_node_type_id !== "string") {
    return errorResponse(c, 400, "source_node_type_id is required");
  }

  if (!body.target_node_type_id || typeof body.target_node_type_id !== "string") {
    return errorResponse(c, 400, "target_node_type_id is required");
  }

  const name = body.name.trim();
  const directed = body.directed !== undefined ? body.directed : true;

  // Validate source node type exists in the same graph
  const sourceNodeType = await c.env.DB.prepare(
    "SELECT id FROM node_types WHERE id = ? AND graph_id = ?",
  )
    .bind(body.source_node_type_id, graph.id)
    .first();

  if (!sourceNodeType) {
    return errorResponse(c, 400, "Source node type not found in this graph");
  }

  // Validate target node type exists in the same graph
  const targetNodeType = await c.env.DB.prepare(
    "SELECT id FROM node_types WHERE id = ? AND graph_id = ?",
  )
    .bind(body.target_node_type_id, graph.id)
    .first();

  if (!targetNodeType) {
    return errorResponse(c, 400, "Target node type not found in this graph");
  }

  // Check name uniqueness within graph
  const existingName = await c.env.DB.prepare(
    "SELECT id FROM edge_types WHERE graph_id = ? AND name = ?",
  )
    .bind(graph.id, name)
    .first();

  if (existingName) {
    return errorResponse(c, 409, "An edge type with this name already exists in this graph");
  }

  // Generate unique slug
  const existingSlugs = await c.env.DB.prepare(
    "SELECT slug FROM edge_types WHERE graph_id = ?",
  )
    .bind(graph.id)
    .all<{ slug: string }>();

  const slug = generateUniqueSlug(name, existingSlugs.results.map((r) => r.slug));

  const id = generateId();
  const now = new Date().toISOString();

  const color = body.color?.trim() || null;

  await c.env.DB.prepare(
    "INSERT INTO edge_types (id, graph_id, name, slug, directed, color, source_node_type_id, target_node_type_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, graph.id, name, slug, directed ? 1 : 0, color, body.source_node_type_id, body.target_node_type_id, now, now)
    .run();

  return c.json(
    {
      data: {
        id,
        graph_id: graph.id,
        name,
        slug,
        directed: !!directed,
        color,
        source_node_type_id: body.source_node_type_id,
        target_node_type_id: body.target_node_type_id,
        created_at: now,
        updated_at: now,
      },
    },
    201,
  );
});

/** Coerce SQLite integer booleans in an EdgeTypeRow to proper booleans. */
function formatEdgeType(row: EdgeTypeRow) {
  return { ...row, directed: row.directed === 1, color: row.color ?? null };
}

// GET / — list all edge types for the graph
edgeTypes.get("/", async (c) => {
  const graph = c.get("graph");

  const result = await c.env.DB.prepare(
    "SELECT id, graph_id, name, slug, directed, color, source_node_type_id, target_node_type_id, created_at, updated_at FROM edge_types WHERE graph_id = ? ORDER BY created_at ASC",
  )
    .bind(graph.id)
    .all<EdgeTypeRow>();

  return c.json({ data: result.results.map(formatEdgeType) });
});

// GET /:edgeTypeId — get single edge type
edgeTypes.get("/:edgeTypeId", async (c) => {
  const graph = c.get("graph");
  const edgeTypeId = c.req.param("edgeTypeId");

  const edgeType = await c.env.DB.prepare(
    "SELECT id, graph_id, name, slug, directed, color, source_node_type_id, target_node_type_id, created_at, updated_at FROM edge_types WHERE id = ? AND graph_id = ?",
  )
    .bind(edgeTypeId, graph.id)
    .first<EdgeTypeRow>();

  if (!edgeType) {
    return errorResponse(c, 404, "Edge type not found");
  }

  return c.json({ data: formatEdgeType(edgeType) });
});

// PATCH /:edgeTypeId — update name, directed flag, or color
edgeTypes.patch("/:edgeTypeId", async (c) => {
  const graph = c.get("graph");
  const edgeTypeId = c.req.param("edgeTypeId");

  const body = await c.req.json<{
    name?: string;
    directed?: boolean;
    color?: string | null;
    source_node_type_id?: string;
    target_node_type_id?: string;
  }>();

  // Reject attempts to change immutable fields
  if (body.source_node_type_id !== undefined || body.target_node_type_id !== undefined) {
    return errorResponse(c, 400, "Source and target node types are immutable");
  }

  const edgeType = await c.env.DB.prepare(
    "SELECT id, graph_id, name, slug, directed, color, source_node_type_id, target_node_type_id, created_at, updated_at FROM edge_types WHERE id = ? AND graph_id = ?",
  )
    .bind(edgeTypeId, graph.id)
    .first<EdgeTypeRow>();

  if (!edgeType) {
    return errorResponse(c, 404, "Edge type not found");
  }

  const name = body.name !== undefined ? body.name.trim() : edgeType.name;
  const directed = body.directed !== undefined ? (body.directed ? 1 : 0) : edgeType.directed;
  const color =
    body.color !== undefined
      ? body.color?.trim() || null
      : edgeType.color;

  if (!name) {
    return errorResponse(c, 400, "Edge type name cannot be empty");
  }

  // Check name uniqueness within graph (exclude current edge type)
  if (body.name !== undefined && name !== edgeType.name) {
    const existingName = await c.env.DB.prepare(
      "SELECT id FROM edge_types WHERE graph_id = ? AND name = ? AND id != ?",
    )
      .bind(graph.id, name, edgeTypeId)
      .first();

    if (existingName) {
      return errorResponse(c, 409, "An edge type with this name already exists in this graph");
    }
  }

  const now = new Date().toISOString();

  await c.env.DB.prepare(
    "UPDATE edge_types SET name = ?, directed = ?, color = ?, updated_at = ? WHERE id = ?",
  )
    .bind(name, directed, color, now, edgeTypeId)
    .run();

  return c.json({
    data: {
      id: edgeType.id,
      graph_id: edgeType.graph_id,
      name,
      slug: edgeType.slug,
      directed: directed === 1,
      color,
      source_node_type_id: edgeType.source_node_type_id,
      target_node_type_id: edgeType.target_node_type_id,
      created_at: edgeType.created_at,
      updated_at: now,
    },
  });
});

// DELETE /:edgeTypeId — delete edge type (FK CASCADE handles edges)
edgeTypes.delete("/:edgeTypeId", async (c) => {
  const graph = c.get("graph");
  const edgeTypeId = c.req.param("edgeTypeId");

  const edgeType = await c.env.DB.prepare(
    "SELECT id FROM edge_types WHERE id = ? AND graph_id = ?",
  )
    .bind(edgeTypeId, graph.id)
    .first();

  if (!edgeType) {
    return errorResponse(c, 404, "Edge type not found");
  }

  await c.env.DB.prepare("DELETE FROM edge_types WHERE id = ?").bind(edgeTypeId).run();

  return c.body(null, 204);
});

// Sub-route: fields under /:edgeTypeId/fields
edgeTypes.route("/:edgeTypeId/fields", edgeTypeFields);

export { edgeTypes };

import { Hono } from "hono";
import { generateId } from "../lib/id.js";
import { errorResponse } from "../lib/errors.js";
import { validateEntityData, type FieldDefinition } from "@lattice/shared";
import type { Bindings } from "../index.js";

type EdgeRow = {
  id: string;
  graph_id: string;
  edge_type_id: string;
  source_node_id: string;
  target_node_id: string;
  data: string;
  created_at: string;
  updated_at: string;
};

type EdgeTypeRow = {
  id: string;
  source_node_type_id: string;
  target_node_type_id: string;
};

type NodeRow = {
  id: string;
  node_type_id: string;
};

type FieldRow = {
  slug: string;
  name: string;
  field_type: string;
  required: number;
  config: string | null;
};

const edges = new Hono<{ Bindings: Bindings }>();

// POST / — create a new edge
edges.post("/", async (c) => {
  const graph = c.get("graph");
  const body = await c.req.json<{
    edge_type_id?: string;
    source_node_id?: string;
    target_node_id?: string;
    data?: Record<string, unknown>;
  }>();

  if (!body.edge_type_id || typeof body.edge_type_id !== "string") {
    return errorResponse(c, 400, "edge_type_id is required");
  }

  if (!body.source_node_id || typeof body.source_node_id !== "string") {
    return errorResponse(c, 400, "source_node_id is required");
  }

  if (!body.target_node_id || typeof body.target_node_id !== "string") {
    return errorResponse(c, 400, "target_node_id is required");
  }

  // Reject self-referencing edges
  if (body.source_node_id === body.target_node_id) {
    return errorResponse(c, 400, "Self-referencing edges are not allowed");
  }

  // Validate edge type belongs to this graph
  const edgeType = await c.env.DB.prepare(
    "SELECT id, source_node_type_id, target_node_type_id FROM edge_types WHERE id = ? AND graph_id = ?",
  )
    .bind(body.edge_type_id, graph.id)
    .first<EdgeTypeRow>();

  if (!edgeType) {
    return errorResponse(c, 400, "Edge type not found in this graph");
  }

  // Validate source node exists in this graph
  const sourceNode = await c.env.DB.prepare(
    "SELECT id, node_type_id FROM nodes WHERE id = ? AND graph_id = ?",
  )
    .bind(body.source_node_id, graph.id)
    .first<NodeRow>();

  if (!sourceNode) {
    return errorResponse(c, 400, "Source node not found in this graph");
  }

  // Validate target node exists in this graph
  const targetNode = await c.env.DB.prepare(
    "SELECT id, node_type_id FROM nodes WHERE id = ? AND graph_id = ?",
  )
    .bind(body.target_node_id, graph.id)
    .first<NodeRow>();

  if (!targetNode) {
    return errorResponse(c, 400, "Target node not found in this graph");
  }

  // Validate type constraints
  if (sourceNode.node_type_id !== edgeType.source_node_type_id) {
    return errorResponse(
      c,
      400,
      "Source node type does not match edge type's source_node_type_id",
    );
  }

  if (targetNode.node_type_id !== edgeType.target_node_type_id) {
    return errorResponse(
      c,
      400,
      "Target node type does not match edge type's target_node_type_id",
    );
  }

  // Fetch field definitions for this edge type
  const fieldResults = await c.env.DB.prepare(
    "SELECT slug, name, field_type, required, config FROM edge_type_fields WHERE edge_type_id = ?",
  )
    .bind(body.edge_type_id)
    .all<FieldRow>();

  const fields: FieldDefinition[] = fieldResults.results.map((f) => ({
    slug: f.slug,
    name: f.name,
    field_type: f.field_type,
    required: f.required,
    config: JSON.parse(f.config || "{}"),
  }));

  const data = body.data ?? {};

  const validation = validateEntityData(data, fields);
  if (!validation.valid) {
    return errorResponse(
      c,
      400,
      `Validation failed: ${validation.errors.map((e) => e.message).join("; ")}`,
    );
  }

  const id = generateId();
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    "INSERT INTO edges (id, graph_id, edge_type_id, source_node_id, target_node_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, graph.id, body.edge_type_id, body.source_node_id, body.target_node_id, JSON.stringify(data), now, now)
    .run();

  return c.json(
    {
      data: {
        id,
        graph_id: graph.id,
        edge_type_id: body.edge_type_id,
        source_node_id: body.source_node_id,
        target_node_id: body.target_node_id,
        data,
        created_at: now,
        updated_at: now,
      },
    },
    201,
  );
});

// GET / — list edges (optionally filtered by type)
edges.get("/", async (c) => {
  const graph = c.get("graph");
  const type = c.req.query("type");

  let result;
  if (type) {
    result = await c.env.DB.prepare(
      "SELECT id, graph_id, edge_type_id, source_node_id, target_node_id, data, created_at, updated_at FROM edges WHERE graph_id = ? AND edge_type_id = ? ORDER BY created_at ASC",
    )
      .bind(graph.id, type)
      .all<EdgeRow>();
  } else {
    result = await c.env.DB.prepare(
      "SELECT id, graph_id, edge_type_id, source_node_id, target_node_id, data, created_at, updated_at FROM edges WHERE graph_id = ? ORDER BY created_at ASC",
    )
      .bind(graph.id)
      .all<EdgeRow>();
  }

  const edges_list = result.results.map((row) => ({
    ...row,
    data: JSON.parse(row.data),
  }));

  return c.json({ data: edges_list });
});

// GET /:edgeId — get single edge
edges.get("/:edgeId", async (c) => {
  const graph = c.get("graph");
  const edgeId = c.req.param("edgeId");

  const edge = await c.env.DB.prepare(
    "SELECT id, graph_id, edge_type_id, source_node_id, target_node_id, data, created_at, updated_at FROM edges WHERE id = ? AND graph_id = ?",
  )
    .bind(edgeId, graph.id)
    .first<EdgeRow>();

  if (!edge) {
    return errorResponse(c, 404, "Edge not found");
  }

  return c.json({
    data: {
      ...edge,
      data: JSON.parse(edge.data),
    },
  });
});

// PATCH /:edgeId — update edge data
edges.patch("/:edgeId", async (c) => {
  const graph = c.get("graph");
  const edgeId = c.req.param("edgeId");

  const body = await c.req.json<{ data?: Record<string, unknown> }>();

  const edge = await c.env.DB.prepare(
    "SELECT id, graph_id, edge_type_id, source_node_id, target_node_id, data, created_at, updated_at FROM edges WHERE id = ? AND graph_id = ?",
  )
    .bind(edgeId, graph.id)
    .first<EdgeRow>();

  if (!edge) {
    return errorResponse(c, 404, "Edge not found");
  }

  // Fetch field definitions for this edge's type
  const fieldResults = await c.env.DB.prepare(
    "SELECT slug, name, field_type, required, config FROM edge_type_fields WHERE edge_type_id = ?",
  )
    .bind(edge.edge_type_id)
    .all<FieldRow>();

  const fields: FieldDefinition[] = fieldResults.results.map((f) => ({
    slug: f.slug,
    name: f.name,
    field_type: f.field_type,
    required: f.required,
    config: JSON.parse(f.config || "{}"),
  }));

  const newData = body.data ?? {};

  const validation = validateEntityData(newData, fields, { isUpdate: true });
  if (!validation.valid) {
    return errorResponse(
      c,
      400,
      `Validation failed: ${validation.errors.map((e) => e.message).join("; ")}`,
    );
  }

  // Merge existing data with new data
  const existingData = JSON.parse(edge.data);
  const mergedData = { ...existingData, ...newData };

  const now = new Date().toISOString();

  await c.env.DB.prepare(
    "UPDATE edges SET data = ?, updated_at = ? WHERE id = ?",
  )
    .bind(JSON.stringify(mergedData), now, edgeId)
    .run();

  return c.json({
    data: {
      id: edge.id,
      graph_id: edge.graph_id,
      edge_type_id: edge.edge_type_id,
      source_node_id: edge.source_node_id,
      target_node_id: edge.target_node_id,
      data: mergedData,
      created_at: edge.created_at,
      updated_at: now,
    },
  });
});

// DELETE /:edgeId — delete edge
edges.delete("/:edgeId", async (c) => {
  const graph = c.get("graph");
  const edgeId = c.req.param("edgeId");

  const edge = await c.env.DB.prepare(
    "SELECT id FROM edges WHERE id = ? AND graph_id = ?",
  )
    .bind(edgeId, graph.id)
    .first();

  if (!edge) {
    return errorResponse(c, 404, "Edge not found");
  }

  await c.env.DB.prepare("DELETE FROM edges WHERE id = ?").bind(edgeId).run();

  return c.body(null, 204);
});

export { edges };

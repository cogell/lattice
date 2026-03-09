import { Hono } from "hono";
import { generateId } from "../lib/id.js";
import { errorResponse } from "../lib/errors.js";
import { validateEntityData, type FieldDefinition } from "@lattice/shared";
import type { Bindings } from "../index.js";

type NodeRow = {
  id: string;
  graph_id: string;
  node_type_id: string;
  data: string;
  created_at: string;
  updated_at: string;
};

type FieldRow = {
  slug: string;
  name: string;
  field_type: string;
  required: number;
  config: string | null;
};

const nodes = new Hono<{ Bindings: Bindings }>();

// POST / — create a new node
nodes.post("/", async (c) => {
  const graph = c.get("graph");
  const body = await c.req.json<{
    node_type_id?: string;
    data?: Record<string, unknown>;
  }>();

  if (!body.node_type_id || typeof body.node_type_id !== "string") {
    return errorResponse(c, 400, "node_type_id is required");
  }

  // Validate node_type_id belongs to this graph
  const nodeType = await c.env.DB.prepare(
    "SELECT id FROM node_types WHERE id = ? AND graph_id = ?",
  )
    .bind(body.node_type_id, graph.id)
    .first();

  if (!nodeType) {
    return errorResponse(c, 400, "Node type not found in this graph");
  }

  // Fetch field definitions for validation
  const fieldRows = await c.env.DB.prepare(
    "SELECT slug, name, field_type, required, config FROM node_type_fields WHERE node_type_id = ?",
  )
    .bind(body.node_type_id)
    .all<FieldRow>();

  const fields: FieldDefinition[] = fieldRows.results.map((f) => ({
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
    "INSERT INTO nodes (id, graph_id, node_type_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, graph.id, body.node_type_id, JSON.stringify(data), now, now)
    .run();

  return c.json(
    {
      data: {
        id,
        graph_id: graph.id,
        node_type_id: body.node_type_id,
        data,
        created_at: now,
        updated_at: now,
      },
    },
    201,
  );
});

// GET / — list nodes (optionally filtered by type)
nodes.get("/", async (c) => {
  const graph = c.get("graph");
  const type = c.req.query("type");

  let result;
  if (type) {
    result = await c.env.DB.prepare(
      "SELECT id, graph_id, node_type_id, data, created_at, updated_at FROM nodes WHERE graph_id = ? AND node_type_id = ? ORDER BY created_at ASC",
    )
      .bind(graph.id, type)
      .all<NodeRow>();
  } else {
    result = await c.env.DB.prepare(
      "SELECT id, graph_id, node_type_id, data, created_at, updated_at FROM nodes WHERE graph_id = ? ORDER BY created_at ASC",
    )
      .bind(graph.id)
      .all<NodeRow>();
  }

  const nodes_list = result.results.map((row) => ({
    ...row,
    data: JSON.parse(row.data),
  }));

  return c.json({ data: nodes_list });
});

// GET /:nodeId — get single node
nodes.get("/:nodeId", async (c) => {
  const graph = c.get("graph");
  const nodeId = c.req.param("nodeId");

  const node = await c.env.DB.prepare(
    "SELECT id, graph_id, node_type_id, data, created_at, updated_at FROM nodes WHERE id = ? AND graph_id = ?",
  )
    .bind(nodeId, graph.id)
    .first<NodeRow>();

  if (!node) {
    return errorResponse(c, 404, "Node not found");
  }

  return c.json({
    data: {
      ...node,
      data: JSON.parse(node.data),
    },
  });
});

// PATCH /:nodeId — update node data
nodes.patch("/:nodeId", async (c) => {
  const graph = c.get("graph");
  const nodeId = c.req.param("nodeId");

  const body = await c.req.json<{
    data?: Record<string, unknown>;
  }>();

  const node = await c.env.DB.prepare(
    "SELECT id, graph_id, node_type_id, data, created_at, updated_at FROM nodes WHERE id = ? AND graph_id = ?",
  )
    .bind(nodeId, graph.id)
    .first<NodeRow>();

  if (!node) {
    return errorResponse(c, 404, "Node not found");
  }

  const newData = body.data ?? {};

  // Fetch field definitions for the node's type
  const fieldRows = await c.env.DB.prepare(
    "SELECT slug, name, field_type, required, config FROM node_type_fields WHERE node_type_id = ?",
  )
    .bind(node.node_type_id)
    .all<FieldRow>();

  const fields: FieldDefinition[] = fieldRows.results.map((f) => ({
    slug: f.slug,
    name: f.name,
    field_type: f.field_type,
    required: f.required,
    config: JSON.parse(f.config || "{}"),
  }));

  const validation = validateEntityData(newData, fields, { isUpdate: true });
  if (!validation.valid) {
    return errorResponse(
      c,
      400,
      `Validation failed: ${validation.errors.map((e) => e.message).join("; ")}`,
    );
  }

  // Merge existing data with new data
  const existingData = JSON.parse(node.data);
  const mergedData = { ...existingData, ...newData };

  const now = new Date().toISOString();

  await c.env.DB.prepare(
    "UPDATE nodes SET data = ?, updated_at = ? WHERE id = ?",
  )
    .bind(JSON.stringify(mergedData), now, nodeId)
    .run();

  return c.json({
    data: {
      id: node.id,
      graph_id: node.graph_id,
      node_type_id: node.node_type_id,
      data: mergedData,
      created_at: node.created_at,
      updated_at: now,
    },
  });
});

// DELETE /:nodeId — delete node and connected edges
nodes.delete("/:nodeId", async (c) => {
  const graph = c.get("graph");
  const nodeId = c.req.param("nodeId");

  const node = await c.env.DB.prepare(
    "SELECT id FROM nodes WHERE id = ? AND graph_id = ?",
  )
    .bind(nodeId, graph.id)
    .first();

  if (!node) {
    return errorResponse(c, 404, "Node not found");
  }

  // Delete connected edges explicitly
  await c.env.DB.prepare(
    "DELETE FROM edges WHERE source_node_id = ? OR target_node_id = ?",
  )
    .bind(nodeId, nodeId)
    .run();

  // Delete the node
  await c.env.DB.prepare("DELETE FROM nodes WHERE id = ?")
    .bind(nodeId)
    .run();

  return c.body(null, 204);
});

export { nodes };

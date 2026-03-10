import { Hono } from "hono";
import type { Bindings } from "../index.js";

const NODE_LIMIT = 1000;
const EDGE_LIMIT = 5000;

type NodeRow = {
  id: string;
  graph_id: string;
  node_type_id: string;
  data: string;
  created_at: string;
  updated_at: string;
};

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

type EdgeTypeRow = {
  id: string;
  graph_id: string;
  name: string;
  slug: string;
  directed: number;
  source_node_type_id: string;
  target_node_type_id: string;
  created_at: string;
  updated_at: string;
};

type NodeTypeFieldRow = {
  id: string;
  node_type_id: string;
  name: string;
  slug: string;
  field_type: string;
  ordinal: number;
  required: number;
  config: string | null;
  created_at: string;
  updated_at: string;
};

type EdgeTypeFieldRow = {
  id: string;
  edge_type_id: string;
  name: string;
  slug: string;
  field_type: string;
  ordinal: number;
  required: number;
  config: string | null;
  created_at: string;
  updated_at: string;
};

const viewData = new Hono<{ Bindings: Bindings }>();

// GET / — fetch all data for a graph's view (nodes, edges, types, fields)
viewData.get("/", async (c) => {
  const graph = c.get("graph");
  const graphId = graph.id;

  // Batch the four main queries in parallel using D1 batch API
  const [nodesResult, edgesResult, nodeTypesResult, edgeTypesResult] =
    await c.env.DB.batch<
      NodeRow | EdgeRow | NodeTypeRow | EdgeTypeRow
    >([
      c.env.DB.prepare(
        "SELECT id, graph_id, node_type_id, data, created_at, updated_at FROM nodes WHERE graph_id = ? ORDER BY id LIMIT ?",
      ).bind(graphId, NODE_LIMIT + 1),
      c.env.DB.prepare(
        "SELECT id, graph_id, edge_type_id, source_node_id, target_node_id, data, created_at, updated_at FROM edges WHERE graph_id = ? ORDER BY id LIMIT ?",
      ).bind(graphId, EDGE_LIMIT + 1),
      c.env.DB.prepare(
        "SELECT * FROM node_types WHERE graph_id = ? ORDER BY name",
      ).bind(graphId),
      c.env.DB.prepare(
        "SELECT * FROM edge_types WHERE graph_id = ? ORDER BY name",
      ).bind(graphId),
    ]);

  const nodeRows = nodesResult.results as NodeRow[];
  const edgeRows = edgesResult.results as EdgeRow[];
  const nodeTypeRows = nodeTypesResult.results as NodeTypeRow[];
  const edgeTypeRows = edgeTypesResult.results as EdgeTypeRow[];

  // Determine truncation using N+1 pattern
  const truncated =
    nodeRows.length > NODE_LIMIT || edgeRows.length > EDGE_LIMIT;

  // Fetch fields for all types in parallel
  const nodeTypeIds = nodeTypeRows.map((t) => t.id);
  const edgeTypeIds = edgeTypeRows.map((t) => t.id);

  const [nodeTypeFieldRows, edgeTypeFieldRows] = await Promise.all([
    fetchNodeTypeFields(c.env.DB, nodeTypeIds),
    fetchEdgeTypeFields(c.env.DB, edgeTypeIds),
  ]);

  // Group fields by parent type ID
  const nodeFieldsByType = new Map<string, NodeTypeFieldRow[]>();
  for (const f of nodeTypeFieldRows) {
    const arr = nodeFieldsByType.get(f.node_type_id) ?? [];
    arr.push(f);
    nodeFieldsByType.set(f.node_type_id, arr);
  }

  const edgeFieldsByType = new Map<string, EdgeTypeFieldRow[]>();
  for (const f of edgeTypeFieldRows) {
    const arr = edgeFieldsByType.get(f.edge_type_id) ?? [];
    arr.push(f);
    edgeFieldsByType.set(f.edge_type_id, arr);
  }

  // Build node types with embedded fields
  const nodeTypes = nodeTypeRows.map((t) => ({
    id: t.id,
    graph_id: t.graph_id,
    name: t.name,
    slug: t.slug,
    color: t.color,
    icon: t.icon,
    display_field_slug: t.display_field_slug,
    created_at: t.created_at,
    updated_at: t.updated_at,
    fields: (nodeFieldsByType.get(t.id) ?? []).map(formatField),
  }));

  // Build edge types with embedded fields
  const edgeTypes = edgeTypeRows.map((t) => ({
    id: t.id,
    graph_id: t.graph_id,
    name: t.name,
    slug: t.slug,
    directed: t.directed === 1,
    source_node_type_id: t.source_node_type_id,
    target_node_type_id: t.target_node_type_id,
    created_at: t.created_at,
    updated_at: t.updated_at,
    fields: (edgeFieldsByType.get(t.id) ?? []).map(formatField),
  }));

  // Build nodes (slice to limit, parse JSON data)
  const nodes = nodeRows.slice(0, NODE_LIMIT).map((row) => ({
    id: row.id,
    graph_id: row.graph_id,
    node_type_id: row.node_type_id,
    data: JSON.parse(row.data),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  // Build edges (slice to limit, parse JSON data)
  const edges = edgeRows.slice(0, EDGE_LIMIT).map((row) => ({
    id: row.id,
    graph_id: row.graph_id,
    edge_type_id: row.edge_type_id,
    source_node_id: row.source_node_id,
    target_node_id: row.target_node_id,
    data: JSON.parse(row.data),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  return c.json({
    data: {
      nodes,
      edges,
      node_types: nodeTypes,
      edge_types: edgeTypes,
      truncated,
      counts: {
        nodes: nodeRows.length,
        edges: edgeRows.length,
        node_limit: NODE_LIMIT,
        edge_limit: EDGE_LIMIT,
      },
    },
  });
});

// Helper: fetch node type fields for a list of node type IDs
async function fetchNodeTypeFields(
  db: D1Database,
  ids: string[],
): Promise<NodeTypeFieldRow[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(", ");
  const result = await db
    .prepare(
      `SELECT id, node_type_id, name, slug, field_type, ordinal, required, config, created_at, updated_at FROM node_type_fields WHERE node_type_id IN (${placeholders}) ORDER BY ordinal`,
    )
    .bind(...ids)
    .all<NodeTypeFieldRow>();
  return result.results;
}

// Helper: fetch edge type fields for a list of edge type IDs
async function fetchEdgeTypeFields(
  db: D1Database,
  ids: string[],
): Promise<EdgeTypeFieldRow[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(", ");
  const result = await db
    .prepare(
      `SELECT id, edge_type_id, name, slug, field_type, ordinal, required, config, created_at, updated_at FROM edge_type_fields WHERE edge_type_id IN (${placeholders}) ORDER BY ordinal`,
    )
    .bind(...ids)
    .all<EdgeTypeFieldRow>();
  return result.results;
}

// Helper: format a field row for the response (parse config JSON, convert required to boolean)
function formatField(f: NodeTypeFieldRow | EdgeTypeFieldRow) {
  return {
    id: f.id,
    name: f.name,
    slug: f.slug,
    field_type: f.field_type,
    ordinal: f.ordinal,
    required: f.required === 1,
    config: JSON.parse(f.config || "{}"),
    created_at: f.created_at,
    updated_at: f.updated_at,
  };
}

export { viewData };

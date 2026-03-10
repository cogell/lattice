import { Hono } from "hono";
import { generateId } from "../lib/id.js";
import { errorResponse } from "../lib/errors.js";
import { validateEntityData, parsePaginationParams, parseSortParam, parseFilterParams, PaginationError, type FieldDefinition, type FieldType, type FilterParam, serializeNodesToCsv, parseNodeImportCsv, CsvParseError } from "@lattice/shared";
import { buildFilterClauses } from "../lib/filter-sql.js";
import type { Bindings } from "../index.js";

const MAX_IMPORT_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_IMPORT_ROWS = 5000;

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

// GET / — list nodes (optionally filtered by type, sorted/filtered by field)
nodes.get("/", async (c) => {
  const graph = c.get("graph");
  const type = c.req.query("type");
  const searchParams = new URL(c.req.url).searchParams;

  let pagination;
  let sort;
  let filters: FilterParam[] = [];
  try {
    pagination = parsePaginationParams(searchParams);

    // Sorting and filtering require a type filter so field slugs can be validated
    const hasSort = searchParams.has("sort");
    const hasFilters = [...searchParams.keys()].some((k) => k.startsWith("filter["));

    if ((hasSort || hasFilters) && !type) {
      return errorResponse(c, 400, "sort and filter require a type filter");
    }

    if (type) {
      const fieldRows = await c.env.DB.prepare(
        "SELECT slug, field_type FROM node_type_fields WHERE node_type_id = ?",
      )
        .bind(type)
        .all<{ slug: string; field_type: string }>();
      const validSlugs = new Set(fieldRows.results.map((r) => r.slug));
      const fieldMap = new Map(fieldRows.results.map((r) => [r.slug, r.field_type as FieldType]));
      sort = parseSortParam(searchParams, validSlugs);
      filters = parseFilterParams(searchParams, fieldMap);
    }
  } catch (e) {
    if (e instanceof PaginationError) return errorResponse(c, 400, e.message);
    throw e;
  }

  const whereParts = type
    ? ["graph_id = ?", "node_type_id = ?"]
    : ["graph_id = ?"];
  const bindArgs: unknown[] = type ? [graph.id, type] : [graph.id];

  // Add filter clauses
  const { clauses: filterClauses, values: filterValues } = buildFilterClauses(filters);
  whereParts.push(...filterClauses);
  bindArgs.push(...filterValues);

  const whereClause = `WHERE ${whereParts.join(" AND ")}`;

  const countResult = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM nodes ${whereClause}`,
  )
    .bind(...bindArgs)
    .first<{ total: number }>();

  const total = countResult?.total ?? 0;

  const orderClause = sort
    ? `ORDER BY json_extract(data, '$."${sort.field}"') ${sort.direction}, id ${sort.direction}`
    : "ORDER BY created_at ASC";

  const result = await c.env.DB.prepare(
    `SELECT id, graph_id, node_type_id, data, created_at, updated_at FROM nodes ${whereClause} ${orderClause} LIMIT ? OFFSET ?`,
  )
    .bind(...bindArgs, pagination.limit, pagination.offset)
    .all<NodeRow>();

  const nodes_list = result.results.map((row) => ({
    ...row,
    data: JSON.parse(row.data),
  }));

  return c.json({
    data: nodes_list,
    pagination: {
      total,
      limit: pagination.limit,
      offset: pagination.offset,
      has_more: pagination.offset + pagination.limit < total,
    },
  });
});

// GET /export — export nodes as CSV
nodes.get("/export", async (c) => {
  const graph = c.get("graph");
  const type = c.req.query("type");

  if (!type) {
    return errorResponse(c, 400, "type query parameter is required");
  }

  // Validate node type belongs to this graph
  const nodeType = await c.env.DB.prepare(
    "SELECT id, name FROM node_types WHERE id = ? AND graph_id = ?",
  )
    .bind(type, graph.id)
    .first<{ id: string; name: string }>();

  if (!nodeType) {
    return errorResponse(c, 404, "Node type not found in this graph");
  }

  // Fetch field definitions
  const fieldRows2 = await c.env.DB.prepare(
    "SELECT slug, name, field_type, required, config, ordinal FROM node_type_fields WHERE node_type_id = ? ORDER BY ordinal ASC",
  )
    .bind(type)
    .all<FieldRow & { ordinal: number }>();

  const fields2: (FieldDefinition & { ordinal: number })[] = fieldRows2.results.map((f) => ({
    slug: f.slug,
    name: f.name,
    field_type: f.field_type,
    required: f.required,
    config: JSON.parse(f.config || "{}"),
    ordinal: f.ordinal,
  }));

  // Fetch all nodes of this type
  const exportResult = await c.env.DB.prepare(
    "SELECT id, data FROM nodes WHERE graph_id = ? AND node_type_id = ? ORDER BY created_at ASC",
  )
    .bind(graph.id, type)
    .all<{ id: string; data: string }>();

  const nodesData = exportResult.results.map((row) => ({
    id: row.id,
    data: JSON.parse(row.data) as Record<string, unknown>,
  }));

  const csv = serializeNodesToCsv(nodesData, fields2);

  const filename = `${nodeType.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_nodes.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});

// POST /import — import nodes from CSV
nodes.post("/import", async (c) => {
  const graph = c.get("graph");
  const type = c.req.query("type");

  if (!type) {
    return errorResponse(c, 400, "type query parameter is required");
  }

  // Validate node type belongs to this graph
  const importNodeType = await c.env.DB.prepare(
    "SELECT id FROM node_types WHERE id = ? AND graph_id = ?",
  )
    .bind(type, graph.id)
    .first();

  if (!importNodeType) {
    return errorResponse(c, 404, "Node type not found in this graph");
  }

  // Parse multipart body or raw text
  let csvText: string;
  const contentType = c.req.header("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await c.req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return errorResponse(c, 400, "Missing file in multipart upload");
    }
    if (file.size > MAX_IMPORT_SIZE) {
      return errorResponse(c, 400, `File exceeds maximum size of ${MAX_IMPORT_SIZE / 1024 / 1024} MB`);
    }
    csvText = await file.text();
  } else {
    csvText = await c.req.text();
    if (new TextEncoder().encode(csvText).length > MAX_IMPORT_SIZE) {
      return errorResponse(c, 400, `File exceeds maximum size of ${MAX_IMPORT_SIZE / 1024 / 1024} MB`);
    }
  }

  // Fetch field definitions
  const importFieldRows = await c.env.DB.prepare(
    "SELECT slug, name, field_type, required, config, ordinal FROM node_type_fields WHERE node_type_id = ? ORDER BY ordinal ASC",
  )
    .bind(type)
    .all<FieldRow & { ordinal: number }>();

  const importFields: (FieldDefinition & { ordinal: number })[] = importFieldRows.results.map((f) => ({
    slug: f.slug,
    name: f.name,
    field_type: f.field_type,
    required: f.required,
    config: JSON.parse(f.config || "{}"),
    ordinal: f.ordinal,
  }));

  // Parse CSV
  let parsed;
  try {
    parsed = parseNodeImportCsv(csvText, importFields);
  } catch (e) {
    if (e instanceof CsvParseError) {
      return errorResponse(c, 400, e.message);
    }
    throw e;
  }

  if (parsed.rows.length > MAX_IMPORT_ROWS) {
    return errorResponse(c, 400, `File exceeds maximum of ${MAX_IMPORT_ROWS} rows`);
  }

  if (parsed.rows.length === 0) {
    return errorResponse(c, 400, "CSV file contains no data rows");
  }

  // Validate all rows, collecting per-row errors
  const allErrors: Array<{ row: number; field: string; message: string }> = [];
  for (let i = 0; i < parsed.rows.length; i++) {
    const validation = validateEntityData(parsed.rows[i].data, importFields);
    if (!validation.valid) {
      for (const err of validation.errors) {
        allErrors.push({ row: i + 1, field: err.field, message: err.message });
      }
    }
  }

  if (allErrors.length > 0) {
    return c.json(
      {
        error: {
          status: 400,
          message: "Import validation failed",
          details: allErrors,
        },
      },
      400,
    );
  }

  // Batch insert all nodes
  const now = new Date().toISOString();
  const stmts = parsed.rows.map((row) => {
    const id = generateId();
    return c.env.DB.prepare(
      "INSERT INTO nodes (id, graph_id, node_type_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(id, graph.id, type, JSON.stringify(row.data), now, now);
  });

  await c.env.DB.batch(stmts);

  return c.json({ data: { imported: parsed.rows.length } }, 201);
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

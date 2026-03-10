import { Hono } from "hono";
import { generateId } from "../lib/id.js";
import { errorResponse } from "../lib/errors.js";
import { validateEntityData, parsePaginationParams, parseSortParam, parseFilterParams, PaginationError, type FieldDefinition, type FieldType, type FilterParam, serializeEdgesToCsv, parseEdgeImportCsv, CsvParseError } from "@lattice/shared";
import { buildFilterClauses } from "../lib/filter-sql.js";
import type { Bindings } from "../index.js";

const MAX_IMPORT_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_IMPORT_ROWS = 5000;

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

// GET / — list edges (optionally filtered by type, sorted/filtered by field)
edges.get("/", async (c) => {
  const graph = c.get("graph");
  const type = c.req.query("type");
  const searchParams = new URL(c.req.url).searchParams;

  let pagination;
  let sort;
  let filters: FilterParam[] = [];
  try {
    pagination = parsePaginationParams(searchParams);

    const hasSort = searchParams.has("sort");
    const hasFilters = [...searchParams.keys()].some((k) => k.startsWith("filter["));

    if ((hasSort || hasFilters) && !type) {
      return errorResponse(c, 400, "sort and filter require a type filter");
    }

    if (type) {
      const fieldRows = await c.env.DB.prepare(
        "SELECT slug, field_type FROM edge_type_fields WHERE edge_type_id = ?",
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
    ? ["graph_id = ?", "edge_type_id = ?"]
    : ["graph_id = ?"];
  const bindArgs: unknown[] = type ? [graph.id, type] : [graph.id];

  const { clauses: filterClauses, values: filterValues } = buildFilterClauses(filters);
  whereParts.push(...filterClauses);
  bindArgs.push(...filterValues);

  const whereClause = `WHERE ${whereParts.join(" AND ")}`;

  const countResult = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM edges ${whereClause}`,
  )
    .bind(...bindArgs)
    .first<{ total: number }>();

  const total = countResult?.total ?? 0;

  const orderClause = sort
    ? `ORDER BY json_extract(data, '$."${sort.field}"') ${sort.direction}, id ${sort.direction}`
    : "ORDER BY created_at ASC";

  const result = await c.env.DB.prepare(
    `SELECT id, graph_id, edge_type_id, source_node_id, target_node_id, data, created_at, updated_at FROM edges ${whereClause} ${orderClause} LIMIT ? OFFSET ?`,
  )
    .bind(...bindArgs, pagination.limit, pagination.offset)
    .all<EdgeRow>();

  const edges_list = result.results.map((row) => ({
    ...row,
    data: JSON.parse(row.data),
  }));

  return c.json({
    data: edges_list,
    pagination: {
      total,
      limit: pagination.limit,
      offset: pagination.offset,
      has_more: pagination.offset + pagination.limit < total,
    },
  });
});

// GET /export — export edges as CSV
edges.get("/export", async (c) => {
  const graph = c.get("graph");
  const type = c.req.query("type");

  if (!type) {
    return errorResponse(c, 400, "type query parameter is required");
  }

  // Validate edge type belongs to this graph
  const exportEdgeType = await c.env.DB.prepare(
    "SELECT id, name FROM edge_types WHERE id = ? AND graph_id = ?",
  )
    .bind(type, graph.id)
    .first<{ id: string; name: string }>();

  if (!exportEdgeType) {
    return errorResponse(c, 404, "Edge type not found in this graph");
  }

  // Fetch field definitions
  const exportFieldRows = await c.env.DB.prepare(
    "SELECT slug, name, field_type, required, config, ordinal FROM edge_type_fields WHERE edge_type_id = ? ORDER BY ordinal ASC",
  )
    .bind(type)
    .all<FieldRow & { ordinal: number }>();

  const exportFields: (FieldDefinition & { ordinal: number })[] = exportFieldRows.results.map((f) => ({
    slug: f.slug,
    name: f.name,
    field_type: f.field_type,
    required: f.required,
    config: JSON.parse(f.config || "{}"),
    ordinal: f.ordinal,
  }));

  // Fetch all edges of this type
  const exportResult = await c.env.DB.prepare(
    "SELECT id, source_node_id, target_node_id, data FROM edges WHERE graph_id = ? AND edge_type_id = ? ORDER BY created_at ASC",
  )
    .bind(graph.id, type)
    .all<{ id: string; source_node_id: string; target_node_id: string; data: string }>();

  const edgesData = exportResult.results.map((row) => ({
    id: row.id,
    source_node_id: row.source_node_id,
    target_node_id: row.target_node_id,
    data: JSON.parse(row.data) as Record<string, unknown>,
  }));

  const csv = serializeEdgesToCsv(edgesData, exportFields);

  const filename = `${exportEdgeType.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_edges.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});

// POST /import — import edges from CSV
edges.post("/import", async (c) => {
  const graph = c.get("graph");
  const type = c.req.query("type");

  if (!type) {
    return errorResponse(c, 400, "type query parameter is required");
  }

  // Validate edge type belongs to this graph and get constraints
  const importEdgeType = await c.env.DB.prepare(
    "SELECT id, source_node_type_id, target_node_type_id FROM edge_types WHERE id = ? AND graph_id = ?",
  )
    .bind(type, graph.id)
    .first<EdgeTypeRow>();

  if (!importEdgeType) {
    return errorResponse(c, 404, "Edge type not found in this graph");
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
    "SELECT slug, name, field_type, required, config, ordinal FROM edge_type_fields WHERE edge_type_id = ? ORDER BY ordinal ASC",
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
    parsed = parseEdgeImportCsv(csvText, importFields);
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

  // Validate all rows: field data + source/target constraints
  const allErrors: Array<{ row: number; field: string; message: string }> = [];

  // Collect all unique node IDs to validate in bulk
  const nodeIds = new Set<string>();
  for (const row of parsed.rows) {
    if (row.source_node_id) nodeIds.add(row.source_node_id);
    if (row.target_node_id) nodeIds.add(row.target_node_id);
  }

  // Bulk-fetch node info for validation
  const nodeMap = new Map<string, { id: string; node_type_id: string }>();
  if (nodeIds.size > 0) {
    const placeholders = [...nodeIds].map(() => "?").join(",");
    const nodeResult = await c.env.DB.prepare(
      `SELECT id, node_type_id FROM nodes WHERE id IN (${placeholders}) AND graph_id = ?`,
    )
      .bind(...nodeIds, graph.id)
      .all<{ id: string; node_type_id: string }>();
    for (const n of nodeResult.results) {
      nodeMap.set(n.id, n);
    }
  }

  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i];
    const rowNum = i + 1;

    // Validate source_node_id
    if (!row.source_node_id) {
      allErrors.push({ row: rowNum, field: "source_node_id", message: "source_node_id is required" });
    } else {
      const sourceNode = nodeMap.get(row.source_node_id);
      if (!sourceNode) {
        allErrors.push({ row: rowNum, field: "source_node_id", message: `Source node "${row.source_node_id}" not found` });
      } else if (sourceNode.node_type_id !== importEdgeType.source_node_type_id) {
        allErrors.push({ row: rowNum, field: "source_node_id", message: "Source node type does not match edge type constraint" });
      }
    }

    // Validate target_node_id
    if (!row.target_node_id) {
      allErrors.push({ row: rowNum, field: "target_node_id", message: "target_node_id is required" });
    } else {
      const targetNode = nodeMap.get(row.target_node_id);
      if (!targetNode) {
        allErrors.push({ row: rowNum, field: "target_node_id", message: `Target node "${row.target_node_id}" not found` });
      } else if (targetNode.node_type_id !== importEdgeType.target_node_type_id) {
        allErrors.push({ row: rowNum, field: "target_node_id", message: "Target node type does not match edge type constraint" });
      }
    }

    // Reject self-references
    if (row.source_node_id && row.target_node_id && row.source_node_id === row.target_node_id) {
      allErrors.push({ row: rowNum, field: "target_node_id", message: "Self-referencing edges are not allowed" });
    }

    // Validate field data
    const validation = validateEntityData(row.data, importFields);
    if (!validation.valid) {
      for (const err of validation.errors) {
        allErrors.push({ row: rowNum, field: err.field, message: err.message });
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

  // Batch insert all edges
  const now = new Date().toISOString();
  const stmts = parsed.rows.map((row) => {
    const id = generateId();
    return c.env.DB.prepare(
      "INSERT INTO edges (id, graph_id, edge_type_id, source_node_id, target_node_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(id, graph.id, type, row.source_node_id, row.target_node_id, JSON.stringify(row.data), now, now);
  });

  await c.env.DB.batch(stmts);

  return c.json({ data: { imported: parsed.rows.length } }, 201);
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

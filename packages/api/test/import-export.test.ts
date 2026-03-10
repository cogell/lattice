import { env, SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import "../src/index";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ImportErrorDetail = { row: number; field: string; message: string };
type ImportErrorBody = {
  error: { status: number; message: string; details: ImportErrorDetail[] };
};
type ErrorBody = { error: { status: number; message: string } };

// ---------------------------------------------------------------------------
// Setup helpers (each test creates its own isolated graph + schema)
// ---------------------------------------------------------------------------

async function createGraph(name: string): Promise<string> {
  const res = await SELF.fetch("http://localhost/api/v1/graphs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const body = await res.json<{ data: { id: string } }>();
  return body.data.id;
}

async function insertNodeType(graphId: string, id: string, name: string, slug: string) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO node_types (id, graph_id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(id, graphId, name, slug, now, now).run();
}

async function insertNodeTypeField(
  nodeTypeId: string, id: string, slug: string, name: string,
  fieldType: string, ordinal: number, required: number, config = "{}",
) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO node_type_fields (id, node_type_id, name, slug, field_type, ordinal, required, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(id, nodeTypeId, name, slug, fieldType, ordinal, required, config, now, now).run();
}

async function insertEdgeType(
  graphId: string, id: string, name: string, slug: string,
  sourceNodeTypeId: string, targetNodeTypeId: string,
) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO edge_types (id, graph_id, name, slug, directed, source_node_type_id, target_node_type_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(id, graphId, name, slug, 1, sourceNodeTypeId, targetNodeTypeId, now, now).run();
}

async function insertEdgeTypeField(
  edgeTypeId: string, id: string, slug: string, name: string,
  fieldType: string, ordinal: number, required: number, config = "{}",
) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO edge_type_fields (id, edge_type_id, name, slug, field_type, ordinal, required, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(id, edgeTypeId, name, slug, fieldType, ordinal, required, config, now, now).run();
}

async function insertNode(graphId: string, id: string, nodeTypeId: string, data: Record<string, unknown>) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO nodes (id, graph_id, node_type_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(id, graphId, nodeTypeId, JSON.stringify(data), now, now).run();
}

async function insertEdge(
  graphId: string, id: string, edgeTypeId: string,
  sourceNodeId: string, targetNodeId: string, data: Record<string, unknown> = {},
) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO edges (id, graph_id, edge_type_id, source_node_id, target_node_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(id, graphId, edgeTypeId, sourceNodeId, targetNodeId, JSON.stringify(data), now, now).run();
}

/** Standard test scaffold: graph + node type with text/number/boolean/select fields. */
async function setupNodeGraph() {
  const graphId = await createGraph("Test Graph");
  const ntId = "nt-1";
  await insertNodeType(graphId, ntId, "Task", "task");
  await insertNodeTypeField(ntId, "f-title", "title", "Title", "text", 0, 1);
  await insertNodeTypeField(ntId, "f-prio", "priority", "Priority", "number", 1, 0);
  await insertNodeTypeField(ntId, "f-status", "status", "Status", "select", 2, 1,
    '{"options":["open","closed","in_progress"]}');
  return { graphId, ntId };
}

/** Standard test scaffold: graph + two node types + edge type with a field. */
async function setupEdgeGraph() {
  const graphId = await createGraph("Edge Graph");
  const srcTypeId = "nt-src";
  const tgtTypeId = "nt-tgt";
  const etId = "et-1";
  await insertNodeType(graphId, srcTypeId, "Author", "author");
  await insertNodeType(graphId, tgtTypeId, "Book", "book");
  await insertEdgeType(graphId, etId, "Wrote", "wrote", srcTypeId, tgtTypeId);
  await insertEdgeTypeField(etId, "ef-year", "year", "Year", "number", 0, 0);
  await insertNode(graphId, "a-1", srcTypeId, {});
  await insertNode(graphId, "a-2", srcTypeId, {});
  await insertNode(graphId, "b-1", tgtTypeId, {});
  await insertNode(graphId, "b-2", tgtTypeId, {});
  return { graphId, srcTypeId, tgtTypeId, etId };
}

// ---------------------------------------------------------------------------
// Node Export
// ---------------------------------------------------------------------------

describe("Node CSV Export", () => {
  it("exports nodes as CSV with field-name headers", async () => {
    const { graphId, ntId } = await setupNodeGraph();
    await insertNode(graphId, "n-1", ntId, { title: "Alice", priority: 30, status: "open" });
    await insertNode(graphId, "n-2", ntId, { title: "Bob", priority: 25, status: "closed" });

    const res = await SELF.fetch(
      `http://localhost/api/v1/graphs/${graphId}/nodes/export?type=${ntId}`,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");

    const csv = await res.text();
    const lines = csv.trim().split(/\r?\n/);
    expect(lines[0].trim()).toBe("id,Title,Priority,Status");
    expect(lines.length).toBe(3);
    expect(lines[1]).toContain("Alice");
    expect(lines[1]).toContain("30");
    expect(lines[2]).toContain("Bob");
  });

  it("exports empty result set with headers only", async () => {
    const graphId = await createGraph("Empty Export");
    await insertNodeType(graphId, "nt-empty", "Empty", "empty");
    await insertNodeTypeField("nt-empty", "f-emp-1", "label", "Label", "text", 0, 0);

    const res = await SELF.fetch(
      `http://localhost/api/v1/graphs/${graphId}/nodes/export?type=nt-empty`,
    );
    expect(res.status).toBe(200);
    const csv = await res.text();
    const lines = csv.trim().split(/\r?\n/);
    expect(lines[0].trim()).toBe("id,Label");
    expect(lines.length).toBe(1);
  });

  it("returns 400 when type query param is missing", async () => {
    const graphId = await createGraph("Missing Type");
    const res = await SELF.fetch(
      `http://localhost/api/v1/graphs/${graphId}/nodes/export`,
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent node type", async () => {
    const graphId = await createGraph("Not Found");
    const res = await SELF.fetch(
      `http://localhost/api/v1/graphs/${graphId}/nodes/export?type=nonexistent`,
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Edge Export
// ---------------------------------------------------------------------------

describe("Edge CSV Export", () => {
  it("exports edges with source_node_id, target_node_id and field columns", async () => {
    const { graphId, etId } = await setupEdgeGraph();
    await insertEdge(graphId, "e-1", etId, "a-1", "b-1", { year: 2020 });

    const res = await SELF.fetch(
      `http://localhost/api/v1/graphs/${graphId}/edges/export?type=${etId}`,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");

    const csv = await res.text();
    const lines = csv.trim().split(/\r?\n/);
    expect(lines[0].trim()).toBe("id,source_node_id,target_node_id,Year");
    expect(lines.length).toBe(2);
    expect(lines[1]).toContain("a-1");
    expect(lines[1]).toContain("b-1");
    expect(lines[1]).toContain("2020");
  });
});

// ---------------------------------------------------------------------------
// Node Import
// ---------------------------------------------------------------------------

describe("Node CSV Import", () => {
  it("imports valid CSV with correct field mapping", async () => {
    const { graphId, ntId } = await setupNodeGraph();
    const csv = `Title,Priority,Status\nBuild API,1,open\nWrite Tests,2,closed`;

    const res = await SELF.fetch(
      `http://localhost/api/v1/graphs/${graphId}/nodes/import?type=${ntId}`,
      { method: "POST", headers: { "Content-Type": "text/csv" }, body: csv },
    );
    expect(res.status).toBe(201);
    const body = await res.json<{ data: { imported: number } }>();
    expect(body.data.imported).toBe(2);

    // Verify nodes exist
    const listRes = await SELF.fetch(
      `http://localhost/api/v1/graphs/${graphId}/nodes?type=${ntId}`,
    );
    const listBody = await listRes.json<{ pagination: { total: number } }>();
    expect(listBody.pagination.total).toBe(2);
  });

  it("round-trips: export then re-import produces same data", async () => {
    const graphId = await createGraph("Round Trip");
    const ntId = "nt-rt";
    await insertNodeType(graphId, ntId, "Item", "item");
    await insertNodeTypeField(ntId, "frt-name", "name", "Name", "text", 0, 1);
    await insertNodeTypeField(ntId, "frt-count", "count", "Count", "number", 1, 0);
    await insertNode(graphId, "rt-n1", ntId, { name: "Widget", count: 10 });
    await insertNode(graphId, "rt-n2", ntId, { name: "Gadget", count: 20 });

    // Export
    const exportRes = await SELF.fetch(
      `http://localhost/api/v1/graphs/${graphId}/nodes/export?type=${ntId}`,
    );
    expect(exportRes.status).toBe(200);
    const csvText = await exportRes.text();

    // Remove the id column for re-import
    const lines = csvText.trim().split(/\r?\n/);
    const headerCols = lines[0].split(",");
    const idIdx = headerCols.indexOf("id");
    const filteredLines = lines.map((line) => {
      const cols = line.replace(/\r$/, "").split(",");
      cols.splice(idIdx, 1);
      return cols.join(",");
    });
    const importCsv = filteredLines.join("\n");

    // Re-import
    const importRes = await SELF.fetch(
      `http://localhost/api/v1/graphs/${graphId}/nodes/import?type=${ntId}`,
      { method: "POST", headers: { "Content-Type": "text/csv" }, body: importCsv },
    );
    expect(importRes.status).toBe(201);

    // Verify 4 total (2 original + 2 imported)
    const listRes = await SELF.fetch(
      `http://localhost/api/v1/graphs/${graphId}/nodes?type=${ntId}`,
    );
    const listBody = await listRes.json<{ pagination: { total: number } }>();
    expect(listBody.pagination.total).toBe(4);
  });

  it("rejects batch with invalid rows and returns per-row errors", async () => {
    const { graphId, ntId } = await setupNodeGraph();
    const csv = `Title,Priority,Status\nValid,1,open\n,not_a_number,invalid_status`;

    const res = await SELF.fetch(
      `http://localhost/api/v1/graphs/${graphId}/nodes/import?type=${ntId}`,
      { method: "POST", headers: { "Content-Type": "text/csv" }, body: csv },
    );
    expect(res.status).toBe(400);
    const body = await res.json<ImportErrorBody>();
    expect(body.error.message).toBe("Import validation failed");
    expect(body.error.details.length).toBeGreaterThan(0);

    const row2Errors = body.error.details.filter((e) => e.row === 2);
    expect(row2Errors.length).toBeGreaterThan(0);
    expect(row2Errors.find((e) => e.field === "title")).toBeDefined();
    expect(row2Errors.find((e) => e.field === "status")).toBeDefined();
  });

  it("rejects files over 5000 rows", async () => {
    const { graphId, ntId } = await setupNodeGraph();
    const header = "Title,Priority,Status";
    const rows = Array.from({ length: 5001 }, (_, i) => `Task ${i},1,open`);
    const csv = [header, ...rows].join("\n");

    const res = await SELF.fetch(
      `http://localhost/api/v1/graphs/${graphId}/nodes/import?type=${ntId}`,
      { method: "POST", headers: { "Content-Type": "text/csv" }, body: csv },
    );
    expect(res.status).toBe(400);
    const body = await res.json<ErrorBody>();
    expect(body.error.message).toContain("5000");
  });

  it("validates required fields", async () => {
    const { graphId, ntId } = await setupNodeGraph();
    const csv = `Title,Status\nHello,`;

    const res = await SELF.fetch(
      `http://localhost/api/v1/graphs/${graphId}/nodes/import?type=${ntId}`,
      { method: "POST", headers: { "Content-Type": "text/csv" }, body: csv },
    );
    expect(res.status).toBe(400);
    const body = await res.json<ImportErrorBody>();
    const statusErr = body.error.details.find((e) => e.field === "status");
    expect(statusErr).toBeDefined();
  });

  it("validates type mismatches", async () => {
    const { graphId, ntId } = await setupNodeGraph();
    const csv = `Title,Priority,Status\nTest,not_a_number,open`;

    const res = await SELF.fetch(
      `http://localhost/api/v1/graphs/${graphId}/nodes/import?type=${ntId}`,
      { method: "POST", headers: { "Content-Type": "text/csv" }, body: csv },
    );
    expect(res.status).toBe(400);
    const body = await res.json<ImportErrorBody>();
    const priorityErr = body.error.details.find((e) => e.field === "priority");
    expect(priorityErr).toBeDefined();
  });

  it("validates select option constraints", async () => {
    const { graphId, ntId } = await setupNodeGraph();
    const csv = `Title,Status\nTest,invalid_option`;

    const res = await SELF.fetch(
      `http://localhost/api/v1/graphs/${graphId}/nodes/import?type=${ntId}`,
      { method: "POST", headers: { "Content-Type": "text/csv" }, body: csv },
    );
    expect(res.status).toBe(400);
    const body = await res.json<ImportErrorBody>();
    const statusErr = body.error.details.find((e) => e.field === "status");
    expect(statusErr).toBeDefined();
    expect(statusErr!.message).toContain("not a valid option");
  });

  it("rejects empty CSV", async () => {
    const { graphId, ntId } = await setupNodeGraph();
    const csv = `Title,Status`;

    const res = await SELF.fetch(
      `http://localhost/api/v1/graphs/${graphId}/nodes/import?type=${ntId}`,
      { method: "POST", headers: { "Content-Type": "text/csv" }, body: csv },
    );
    expect(res.status).toBe(400);
    const body = await res.json<ErrorBody>();
    expect(body.error.message).toContain("no data rows");
  });
});

// ---------------------------------------------------------------------------
// Edge Import
// ---------------------------------------------------------------------------

describe("Edge CSV Import", () => {
  it("imports valid edge CSV", async () => {
    const { graphId, etId } = await setupEdgeGraph();
    const csv = `source_node_id,target_node_id,Year\na-1,b-1,2020\na-2,b-2,2021`;

    const res = await SELF.fetch(
      `http://localhost/api/v1/graphs/${graphId}/edges/import?type=${etId}`,
      { method: "POST", headers: { "Content-Type": "text/csv" }, body: csv },
    );
    expect(res.status).toBe(201);
    const body = await res.json<{ data: { imported: number } }>();
    expect(body.data.imported).toBe(2);
  });

  it("round-trips: export then re-import edges", async () => {
    const { graphId, etId } = await setupEdgeGraph();
    await insertEdge(graphId, "rt-e1", etId, "a-1", "b-1", { year: 2020 });

    // Export
    const exportRes = await SELF.fetch(
      `http://localhost/api/v1/graphs/${graphId}/edges/export?type=${etId}`,
    );
    expect(exportRes.status).toBe(200);
    const csvText = await exportRes.text();

    // Remove id column
    const lines = csvText.trim().split(/\r?\n/);
    const headerCols = lines[0].split(",");
    const idIdx = headerCols.indexOf("id");
    const filteredLines = lines.map((line) => {
      const cols = line.replace(/\r$/, "").split(",");
      cols.splice(idIdx, 1);
      return cols.join(",");
    });
    const importCsv = filteredLines.join("\n");

    // Re-import
    const importRes = await SELF.fetch(
      `http://localhost/api/v1/graphs/${graphId}/edges/import?type=${etId}`,
      { method: "POST", headers: { "Content-Type": "text/csv" }, body: importCsv },
    );
    expect(importRes.status).toBe(201);

    // 2 total: 1 original + 1 imported
    const listRes = await SELF.fetch(
      `http://localhost/api/v1/graphs/${graphId}/edges?type=${etId}`,
    );
    const listBody = await listRes.json<{ pagination: { total: number } }>();
    expect(listBody.pagination.total).toBe(2);
  });

  it("validates source/target nodes exist", async () => {
    const { graphId, etId } = await setupEdgeGraph();
    const csv = `source_node_id,target_node_id,Year\nnonexistent,b-1,2020`;

    const res = await SELF.fetch(
      `http://localhost/api/v1/graphs/${graphId}/edges/import?type=${etId}`,
      { method: "POST", headers: { "Content-Type": "text/csv" }, body: csv },
    );
    expect(res.status).toBe(400);
    const body = await res.json<ImportErrorBody>();
    const srcErr = body.error.details.find((e) => e.field === "source_node_id");
    expect(srcErr).toBeDefined();
    expect(srcErr!.message).toContain("not found");
  });

  it("validates source/target match edge type node type constraints", async () => {
    const { graphId, etId } = await setupEdgeGraph();
    // Swap: b-1 (Book) as source, a-1 (Author) as target — wrong types
    const csv = `source_node_id,target_node_id,Year\nb-1,a-1,2020`;

    const res = await SELF.fetch(
      `http://localhost/api/v1/graphs/${graphId}/edges/import?type=${etId}`,
      { method: "POST", headers: { "Content-Type": "text/csv" }, body: csv },
    );
    expect(res.status).toBe(400);
    const body = await res.json<ImportErrorBody>();
    const typeErr = body.error.details.find((e) => e.message.includes("does not match"));
    expect(typeErr).toBeDefined();
  });

  it("rejects self-referencing edges", async () => {
    const { graphId, etId } = await setupEdgeGraph();
    const csv = `source_node_id,target_node_id,Year\na-1,a-1,2020`;

    const res = await SELF.fetch(
      `http://localhost/api/v1/graphs/${graphId}/edges/import?type=${etId}`,
      { method: "POST", headers: { "Content-Type": "text/csv" }, body: csv },
    );
    expect(res.status).toBe(400);
    const body = await res.json<ImportErrorBody>();
    const selfRefErr = body.error.details.find((e) => e.message.includes("Self-referencing"));
    expect(selfRefErr).toBeDefined();
  });

  it("rejects entire batch when any row is invalid", async () => {
    const { graphId, etId } = await setupEdgeGraph();
    const csv = `source_node_id,target_node_id,Year\na-1,b-1,2020\na-1,a-1,2021\nnonexistent,b-2,2022`;

    const res = await SELF.fetch(
      `http://localhost/api/v1/graphs/${graphId}/edges/import?type=${etId}`,
      { method: "POST", headers: { "Content-Type": "text/csv" }, body: csv },
    );
    expect(res.status).toBe(400);
    const body = await res.json<ImportErrorBody>();
    expect(body.error.details.length).toBeGreaterThanOrEqual(2);

    // Verify no edges were inserted (batch rejection)
    const listRes = await SELF.fetch(
      `http://localhost/api/v1/graphs/${graphId}/edges?type=${etId}`,
    );
    const listBody = await listRes.json<{ pagination: { total: number } }>();
    expect(listBody.pagination.total).toBe(0);
  });
});

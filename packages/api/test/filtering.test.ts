import { env, SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import "../src/index";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NodeData = {
  id: string;
  graph_id: string;
  node_type_id: string;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type EdgeData = {
  id: string;
  graph_id: string;
  edge_type_id: string;
  source_node_id: string;
  target_node_id: string;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type PaginationMeta = { total: number; limit: number; offset: number; has_more: boolean };
type ErrorBody = { error: { status: number; message: string } };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let counter = 0;
function uid(prefix = "filt") {
  return `${prefix}-${++counter}-${Date.now()}`;
}

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
  )
    .bind(id, graphId, name, slug, now, now)
    .run();
}

async function insertField(
  table: "node_type_fields" | "edge_type_fields",
  parentId: string,
  id: string,
  slug: string,
  name: string,
  fieldType: string,
) {
  const now = new Date().toISOString();
  const col = table === "node_type_fields" ? "node_type_id" : "edge_type_id";
  await env.DB.prepare(
    `INSERT INTO ${table} (id, ${col}, name, slug, field_type, ordinal, required, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, '{}', ?, ?)`,
  )
    .bind(id, parentId, name, slug, fieldType, now, now)
    .run();
}

async function insertNode(graphId: string, id: string, nodeTypeId: string, data: Record<string, unknown>) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO nodes (id, graph_id, node_type_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, graphId, nodeTypeId, JSON.stringify(data), now, now)
    .run();
}

async function insertEdgeType(
  graphId: string,
  id: string,
  name: string,
  slug: string,
  srcTypeId: string,
  tgtTypeId: string,
) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO edge_types (id, graph_id, name, slug, directed, source_node_type_id, target_node_type_id, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)",
  )
    .bind(id, graphId, name, slug, srcTypeId, tgtTypeId, now, now)
    .run();
}

async function insertEdge(
  graphId: string,
  id: string,
  edgeTypeId: string,
  srcNodeId: string,
  tgtNodeId: string,
  data: Record<string, unknown>,
) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO edges (id, graph_id, edge_type_id, source_node_id, target_node_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, graphId, edgeTypeId, srcNodeId, tgtNodeId, JSON.stringify(data), now, now)
    .run();
}

async function fetchList(url: string) {
  const res = await SELF.fetch(url);
  return {
    status: res.status,
    body: await res.json<
      { data: (NodeData | EdgeData)[]; pagination: PaginationMeta } | ErrorBody
    >(),
  };
}

// ---------------------------------------------------------------------------
// Node Filtering Tests
// ---------------------------------------------------------------------------

describe("Filtering - Nodes", () => {
  async function setupNodeData() {
    const graphId = await createGraph(`filter-nodes-${uid()}`);
    const ntId = uid("nt");
    await insertNodeType(graphId, ntId, "Person", "person");
    await insertField("node_type_fields", ntId, uid("f"), "name", "Name", "text");
    await insertField("node_type_fields", ntId, uid("f"), "age", "Age", "number");

    await insertNode(graphId, uid("n"), ntId, { name: "Alice", age: 30 });
    await insertNode(graphId, uid("n"), ntId, { name: "Bob", age: 25 });
    await insertNode(graphId, uid("n"), ntId, { name: "Charlie", age: 30 });
    await insertNode(graphId, uid("n"), ntId, { name: "Alice Smith", age: 40 });

    return { graphId, ntId };
  }

  it("filter[name][eq] returns exact matches", async () => {
    const { graphId, ntId } = await setupNodeData();

    const { status, body } = await fetchList(
      `http://localhost/api/v1/graphs/${graphId}/nodes?type=${ntId}&filter[name][eq]=Alice`,
    );
    expect(status).toBe(200);
    const b = body as { data: NodeData[]; pagination: PaginationMeta };
    expect(b.data.length).toBe(1);
    expect(b.data[0].data.name).toBe("Alice");
    expect(b.pagination.total).toBe(1);
  });

  it("filter[name][contains] returns partial text matches", async () => {
    const { graphId, ntId } = await setupNodeData();

    const { status, body } = await fetchList(
      `http://localhost/api/v1/graphs/${graphId}/nodes?type=${ntId}&filter[name][contains]=Alice`,
    );
    expect(status).toBe(200);
    const b = body as { data: NodeData[]; pagination: PaginationMeta };
    // Should match "Alice" and "Alice Smith"
    expect(b.data.length).toBe(2);
    expect(b.pagination.total).toBe(2);
  });

  it("filter[name][is_null] returns nodes with null/missing field", async () => {
    const { graphId, ntId } = await setupNodeData();
    // Add a node without the name field
    await insertNode(graphId, uid("n"), ntId, { age: 50 });

    const { status, body } = await fetchList(
      `http://localhost/api/v1/graphs/${graphId}/nodes?type=${ntId}&filter[name][is_null]=true`,
    );
    expect(status).toBe(200);
    const b = body as { data: NodeData[]; pagination: PaginationMeta };
    expect(b.data.length).toBe(1);
    expect(b.data[0].data.name).toBeUndefined();
  });

  it("rejects contains on non-text field with 400", async () => {
    const { graphId, ntId } = await setupNodeData();

    const { status, body } = await fetchList(
      `http://localhost/api/v1/graphs/${graphId}/nodes?type=${ntId}&filter[age][contains]=30`,
    );
    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("contains");
    expect(err.error.message).toContain("text");
  });

  it("rejects unknown filter field with 400", async () => {
    const { graphId, ntId } = await setupNodeData();

    const { status, body } = await fetchList(
      `http://localhost/api/v1/graphs/${graphId}/nodes?type=${ntId}&filter[nonexistent][eq]=foo`,
    );
    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("unknown filter field");
  });

  it("rejects invalid operator with 400", async () => {
    const { graphId, ntId } = await setupNodeData();

    const { status, body } = await fetchList(
      `http://localhost/api/v1/graphs/${graphId}/nodes?type=${ntId}&filter[name][gt]=foo`,
    );
    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("invalid filter operator");
  });

  it("rejects filter without type filter with 400", async () => {
    const graphId = await createGraph("filter-no-type");

    const { status, body } = await fetchList(
      `http://localhost/api/v1/graphs/${graphId}/nodes?filter[name][eq]=foo`,
    );
    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("filter require a type filter");
  });

  it("multiple filters are combined (AND)", async () => {
    const { graphId, ntId } = await setupNodeData();

    const { status, body } = await fetchList(
      `http://localhost/api/v1/graphs/${graphId}/nodes?type=${ntId}&filter[name][eq]=Alice&filter[age][eq]=30`,
    );
    expect(status).toBe(200);
    const b = body as { data: NodeData[]; pagination: PaginationMeta };
    expect(b.data.length).toBe(1);
    expect(b.data[0].data.name).toBe("Alice");
    expect(b.data[0].data.age).toBe(30);
  });

  it("filter + sort + pagination compose together", async () => {
    const graphId = await createGraph(`filter-compose-${uid()}`);
    const ntId = uid("nt");
    await insertNodeType(graphId, ntId, "Item", "item");
    await insertField("node_type_fields", ntId, uid("f"), "category", "Category", "text");
    await insertField("node_type_fields", ntId, uid("f"), "rank", "Rank", "number");

    // Insert items: category=A with ranks 3,1,2 and category=B with ranks 4,5
    await insertNode(graphId, uid("n"), ntId, { category: "A", rank: 3 });
    await insertNode(graphId, uid("n"), ntId, { category: "A", rank: 1 });
    await insertNode(graphId, uid("n"), ntId, { category: "B", rank: 4 });
    await insertNode(graphId, uid("n"), ntId, { category: "A", rank: 2 });
    await insertNode(graphId, uid("n"), ntId, { category: "B", rank: 5 });

    // Filter category=A, sort by rank asc, limit to 2
    const { status, body } = await fetchList(
      `http://localhost/api/v1/graphs/${graphId}/nodes?type=${ntId}&filter[category][eq]=A&sort=rank:asc&limit=2`,
    );
    expect(status).toBe(200);
    const b = body as { data: NodeData[]; pagination: PaginationMeta };
    expect(b.data.length).toBe(2);
    expect(b.data[0].data.rank).toBe(1);
    expect(b.data[1].data.rank).toBe(2);
    expect(b.pagination.total).toBe(3); // 3 category=A items total
    expect(b.pagination.has_more).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Edge Filtering Tests
// ---------------------------------------------------------------------------

describe("Filtering - Edges", () => {
  it("filters edges by field value with eq", async () => {
    const graphId = await createGraph(`filter-edges-${uid()}`);
    const ntA = uid("nt");
    const ntB = uid("nt");
    const etId = uid("et");
    await insertNodeType(graphId, ntA, "Src", "src");
    await insertNodeType(graphId, ntB, "Tgt", "tgt");
    await insertEdgeType(graphId, etId, "link", "link", ntA, ntB);
    await insertField("edge_type_fields", etId, uid("f"), "label", "Label", "text");

    for (const label of ["alpha", "beta", "alpha"]) {
      const src = uid("src");
      const tgt = uid("tgt");
      await insertNode(graphId, src, ntA, {});
      await insertNode(graphId, tgt, ntB, {});
      await insertEdge(graphId, uid("edge"), etId, src, tgt, { label });
    }

    const { status, body } = await fetchList(
      `http://localhost/api/v1/graphs/${graphId}/edges?type=${etId}&filter[label][eq]=alpha`,
    );
    expect(status).toBe(200);
    const b = body as { data: EdgeData[]; pagination: PaginationMeta };
    expect(b.data.length).toBe(2);
    expect(b.pagination.total).toBe(2);
  });

  it("rejects filter without type filter for edges", async () => {
    const graphId = await createGraph("filter-edges-no-type");

    const { status, body } = await fetchList(
      `http://localhost/api/v1/graphs/${graphId}/edges?filter[label][eq]=foo`,
    );
    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("filter require a type filter");
  });
});

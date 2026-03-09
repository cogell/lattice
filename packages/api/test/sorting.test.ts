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
function uid(prefix = "sort") {
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
// Node Sorting Tests
// ---------------------------------------------------------------------------

describe("Sorting - Nodes", () => {
  it("sorts by text field ascending", async () => {
    const graphId = await createGraph("sort-text-asc");
    const ntId = uid("nt");
    await insertNodeType(graphId, ntId, "Person", "person");
    await insertField("node_type_fields", ntId, uid("f"), "name", "Name", "text");

    await insertNode(graphId, uid("n"), ntId, { name: "Charlie" });
    await insertNode(graphId, uid("n"), ntId, { name: "Alice" });
    await insertNode(graphId, uid("n"), ntId, { name: "Bob" });

    const { status, body } = await fetchList(
      `http://localhost/api/v1/graphs/${graphId}/nodes?type=${ntId}&sort=name:asc`,
    );
    expect(status).toBe(200);
    const b = body as { data: NodeData[]; pagination: PaginationMeta };
    const names = b.data.map((n) => n.data.name);
    expect(names).toEqual(["Alice", "Bob", "Charlie"]);
  });

  it("sorts by text field descending", async () => {
    const graphId = await createGraph("sort-text-desc");
    const ntId = uid("nt");
    await insertNodeType(graphId, ntId, "Person", "person");
    await insertField("node_type_fields", ntId, uid("f"), "name", "Name", "text");

    await insertNode(graphId, uid("n"), ntId, { name: "Alice" });
    await insertNode(graphId, uid("n"), ntId, { name: "Charlie" });
    await insertNode(graphId, uid("n"), ntId, { name: "Bob" });

    const { status, body } = await fetchList(
      `http://localhost/api/v1/graphs/${graphId}/nodes?type=${ntId}&sort=name:desc`,
    );
    expect(status).toBe(200);
    const b = body as { data: NodeData[]; pagination: PaginationMeta };
    const names = b.data.map((n) => n.data.name);
    expect(names).toEqual(["Charlie", "Bob", "Alice"]);
  });

  it("sorts by number field", async () => {
    const graphId = await createGraph("sort-number");
    const ntId = uid("nt");
    await insertNodeType(graphId, ntId, "Scored", "scored");
    await insertField("node_type_fields", ntId, uid("f"), "score", "Score", "number");

    await insertNode(graphId, uid("n"), ntId, { score: 30 });
    await insertNode(graphId, uid("n"), ntId, { score: 10 });
    await insertNode(graphId, uid("n"), ntId, { score: 20 });

    const { body } = await fetchList(
      `http://localhost/api/v1/graphs/${graphId}/nodes?type=${ntId}&sort=score:asc`,
    );
    const b = body as { data: NodeData[]; pagination: PaginationMeta };
    const scores = b.data.map((n) => n.data.score);
    expect(scores).toEqual([10, 20, 30]);
  });

  it("sorts by date field", async () => {
    const graphId = await createGraph("sort-date");
    const ntId = uid("nt");
    await insertNodeType(graphId, ntId, "Event", "event");
    await insertField("node_type_fields", ntId, uid("f"), "date", "Date", "date");

    await insertNode(graphId, uid("n"), ntId, { date: "2025-03-15" });
    await insertNode(graphId, uid("n"), ntId, { date: "2025-01-01" });
    await insertNode(graphId, uid("n"), ntId, { date: "2025-06-30" });

    const { body } = await fetchList(
      `http://localhost/api/v1/graphs/${graphId}/nodes?type=${ntId}&sort=date:asc`,
    );
    const b = body as { data: NodeData[]; pagination: PaginationMeta };
    const dates = b.data.map((n) => n.data.date);
    expect(dates).toEqual(["2025-01-01", "2025-03-15", "2025-06-30"]);
  });

  it("default sort when sort param omitted is creation order", async () => {
    const graphId = await createGraph("sort-default");
    const ntId = uid("nt");
    await insertNodeType(graphId, ntId, "Item", "item");
    await insertField("node_type_fields", ntId, uid("f"), "label", "Label", "text");

    // Insert in specific order: Z, A, M
    const n1 = uid("n");
    const n2 = uid("n");
    const n3 = uid("n");
    await insertNode(graphId, n1, ntId, { label: "Z" });
    await insertNode(graphId, n2, ntId, { label: "A" });
    await insertNode(graphId, n3, ntId, { label: "M" });

    const { body } = await fetchList(
      `http://localhost/api/v1/graphs/${graphId}/nodes?type=${ntId}`,
    );
    const b = body as { data: NodeData[]; pagination: PaginationMeta };
    // Should be in creation order (created_at ASC), not alphabetical
    const labels = b.data.map((n) => n.data.label);
    expect(labels).toEqual(["Z", "A", "M"]);
  });

  it("rejects unknown sort field with 400", async () => {
    const graphId = await createGraph("sort-unknown");
    const ntId = uid("nt");
    await insertNodeType(graphId, ntId, "Plain", "plain");
    await insertField("node_type_fields", ntId, uid("f"), "title", "Title", "text");

    const { status, body } = await fetchList(
      `http://localhost/api/v1/graphs/${graphId}/nodes?type=${ntId}&sort=nonexistent:asc`,
    );
    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("unknown sort field");
  });

  it("rejects sort without type filter with 400", async () => {
    const graphId = await createGraph("sort-no-type");

    const { status, body } = await fetchList(
      `http://localhost/api/v1/graphs/${graphId}/nodes?sort=name:asc`,
    );
    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("require a type filter");
  });

  it("sort composes with pagination", async () => {
    const graphId = await createGraph("sort-pagination");
    const ntId = uid("nt");
    await insertNodeType(graphId, ntId, "Ranked", "ranked");
    await insertField("node_type_fields", ntId, uid("f"), "rank", "Rank", "number");

    for (let i = 5; i >= 1; i--) {
      await insertNode(graphId, uid("n"), ntId, { rank: i });
    }

    // Get first page of 2 sorted by rank asc
    const { body: page1 } = await fetchList(
      `http://localhost/api/v1/graphs/${graphId}/nodes?type=${ntId}&sort=rank:asc&limit=2&offset=0`,
    );
    const p1 = page1 as { data: NodeData[]; pagination: PaginationMeta };
    expect(p1.data.map((n) => n.data.rank)).toEqual([1, 2]);
    expect(p1.pagination.has_more).toBe(true);

    // Get second page
    const { body: page2 } = await fetchList(
      `http://localhost/api/v1/graphs/${graphId}/nodes?type=${ntId}&sort=rank:asc&limit=2&offset=2`,
    );
    const p2 = page2 as { data: NodeData[]; pagination: PaginationMeta };
    expect(p2.data.map((n) => n.data.rank)).toEqual([3, 4]);
    expect(p2.pagination.has_more).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Edge Sorting Tests
// ---------------------------------------------------------------------------

describe("Sorting - Edges", () => {
  async function setupForEdgeSorting() {
    const graphId = await createGraph(`sort-edges-${uid()}`);
    const ntA = uid("nt");
    const ntB = uid("nt");
    const etId = uid("et");
    await insertNodeType(graphId, ntA, "Src", "src");
    await insertNodeType(graphId, ntB, "Tgt", "tgt");
    await insertEdgeType(graphId, etId, "link", "link", ntA, ntB);
    await insertField("edge_type_fields", etId, uid("f"), "weight", "Weight", "number");
    return { graphId, ntA, ntB, etId };
  }

  it("sorts edges by number field ascending", async () => {
    const { graphId, ntA, ntB, etId } = await setupForEdgeSorting();

    for (const w of [30, 10, 20]) {
      const src = uid("src");
      const tgt = uid("tgt");
      await insertNode(graphId, src, ntA, {});
      await insertNode(graphId, tgt, ntB, {});
      await insertEdge(graphId, uid("edge"), etId, src, tgt, { weight: w });
    }

    const { status, body } = await fetchList(
      `http://localhost/api/v1/graphs/${graphId}/edges?type=${etId}&sort=weight:asc`,
    );
    expect(status).toBe(200);
    const b = body as { data: EdgeData[]; pagination: PaginationMeta };
    const weights = b.data.map((e) => e.data.weight);
    expect(weights).toEqual([10, 20, 30]);
  });

  it("sorts edges by number field descending", async () => {
    const { graphId, ntA, ntB, etId } = await setupForEdgeSorting();

    for (const w of [10, 30, 20]) {
      const src = uid("src");
      const tgt = uid("tgt");
      await insertNode(graphId, src, ntA, {});
      await insertNode(graphId, tgt, ntB, {});
      await insertEdge(graphId, uid("edge"), etId, src, tgt, { weight: w });
    }

    const { body } = await fetchList(
      `http://localhost/api/v1/graphs/${graphId}/edges?type=${etId}&sort=weight:desc`,
    );
    const b = body as { data: EdgeData[]; pagination: PaginationMeta };
    const weights = b.data.map((e) => e.data.weight);
    expect(weights).toEqual([30, 20, 10]);
  });

  it("rejects sort without type filter for edges", async () => {
    const { graphId } = await setupForEdgeSorting();

    const { status, body } = await fetchList(
      `http://localhost/api/v1/graphs/${graphId}/edges?sort=weight:asc`,
    );
    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("require a type filter");
  });

  it("rejects unknown sort field for edges", async () => {
    const { graphId, etId } = await setupForEdgeSorting();

    const { status, body } = await fetchList(
      `http://localhost/api/v1/graphs/${graphId}/edges?type=${etId}&sort=bogus:asc`,
    );
    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("unknown sort field");
  });
});

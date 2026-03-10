import { env, SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import "../src/index";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PaginationMeta = {
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
};

type ErrorBody = { error: { status: number; message: string } };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let counter = 0;
function uid(prefix = "pag") {
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

async function insertNode(graphId: string, id: string, nodeTypeId: string) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO nodes (id, graph_id, node_type_id, data, created_at, updated_at) VALUES (?, ?, ?, '{}', ?, ?)",
  )
    .bind(id, graphId, nodeTypeId, now, now)
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
) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO edges (id, graph_id, edge_type_id, source_node_id, target_node_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '{}', ?, ?)",
  )
    .bind(id, graphId, edgeTypeId, srcNodeId, tgtNodeId, now, now)
    .run();
}

async function fetchList(url: string) {
  const res = await SELF.fetch(url);
  return {
    status: res.status,
    body: await res.json<{ data: unknown[]; pagination: PaginationMeta } | ErrorBody>(),
  };
}

// ---------------------------------------------------------------------------
// Graph Pagination Tests
// ---------------------------------------------------------------------------

describe("Pagination — Graphs", () => {
  it("returns pagination metadata with default limit and offset", async () => {
    await createGraph("pag-graph-1");

    const { status, body } = await fetchList("http://localhost/api/v1/graphs");
    expect(status).toBe(200);
    const b = body as { data: unknown[]; pagination: PaginationMeta };
    expect(b.pagination).toBeDefined();
    expect(b.pagination.limit).toBe(50);
    expect(b.pagination.offset).toBe(0);
    expect(typeof b.pagination.total).toBe("number");
    expect(typeof b.pagination.has_more).toBe("boolean");
  });

  it("respects custom limit and offset", async () => {
    // Create 5 graphs
    for (let i = 0; i < 5; i++) await createGraph(`pag-limit-${uid()}`);

    const { status, body } = await fetchList(
      "http://localhost/api/v1/graphs?limit=2&offset=0",
    );
    expect(status).toBe(200);
    const b = body as { data: unknown[]; pagination: PaginationMeta };
    expect(b.data.length).toBe(2);
    expect(b.pagination.limit).toBe(2);
    expect(b.pagination.offset).toBe(0);
    expect(b.pagination.has_more).toBe(true);
  });

  it("walks all pages via offset", async () => {
    for (let i = 0; i < 3; i++) await createGraph(`walk-${uid()}`);

    const page1 = await fetchList("http://localhost/api/v1/graphs?limit=2&offset=0");
    const p1 = page1.body as { data: unknown[]; pagination: PaginationMeta };
    expect(p1.data.length).toBe(2);
    expect(p1.pagination.has_more).toBe(true);
    expect(p1.pagination.total).toBe(3);

    const page2 = await fetchList(`http://localhost/api/v1/graphs?limit=2&offset=2`);
    const p2 = page2.body as { data: unknown[]; pagination: PaginationMeta };
    expect(p2.data.length).toBe(1);
    expect(p1.pagination.total).toBe(p2.pagination.total);
  });

  it("returns empty data with correct pagination for empty set", async () => {
    // Use a high offset that exceeds total
    const { status, body } = await fetchList(
      "http://localhost/api/v1/graphs?offset=99999",
    );
    expect(status).toBe(200);
    const b = body as { data: unknown[]; pagination: PaginationMeta };
    expect(b.data).toEqual([]);
    expect(b.pagination.has_more).toBe(false);
  });

  it("rejects limit > 100", async () => {
    const { status, body } = await fetchList(
      "http://localhost/api/v1/graphs?limit=101",
    );
    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("limit");
  });

  it("rejects limit < 1", async () => {
    const { status, body } = await fetchList(
      "http://localhost/api/v1/graphs?limit=0",
    );
    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("limit");
  });

  it("rejects negative offset", async () => {
    const { status, body } = await fetchList(
      "http://localhost/api/v1/graphs?offset=-1",
    );
    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("offset");
  });

  it("rejects non-integer limit", async () => {
    const { status, body } = await fetchList(
      "http://localhost/api/v1/graphs?limit=abc",
    );
    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("limit");
  });
});

// ---------------------------------------------------------------------------
// Node Pagination Tests
// ---------------------------------------------------------------------------

describe("Pagination — Nodes", () => {
  it("returns pagination metadata for nodes", async () => {
    const graphId = await createGraph("pag-nodes-1");
    const ntId = uid("nt");
    await insertNodeType(graphId, ntId, "Item", "item");
    await insertNode(graphId, uid("node"), ntId);
    await insertNode(graphId, uid("node"), ntId);
    await insertNode(graphId, uid("node"), ntId);

    const { status, body } = await fetchList(
      `http://localhost/api/v1/graphs/${graphId}/nodes`,
    );
    expect(status).toBe(200);
    const b = body as { data: unknown[]; pagination: PaginationMeta };
    expect(b.data.length).toBe(3);
    expect(b.pagination.total).toBe(3);
    expect(b.pagination.has_more).toBe(false);
  });

  it("paginates nodes with limit and offset", async () => {
    const graphId = await createGraph("pag-nodes-lim");
    const ntId = uid("nt");
    await insertNodeType(graphId, ntId, "Widget", "widget");
    for (let i = 0; i < 5; i++) await insertNode(graphId, uid("node"), ntId);

    const { body } = await fetchList(
      `http://localhost/api/v1/graphs/${graphId}/nodes?limit=2&offset=0`,
    );
    const b = body as { data: unknown[]; pagination: PaginationMeta };
    expect(b.data.length).toBe(2);
    expect(b.pagination.total).toBe(5);
    expect(b.pagination.has_more).toBe(true);

    const { body: body2 } = await fetchList(
      `http://localhost/api/v1/graphs/${graphId}/nodes?limit=2&offset=4`,
    );
    const b2 = body2 as { data: unknown[]; pagination: PaginationMeta };
    expect(b2.data.length).toBe(1);
    expect(b2.pagination.has_more).toBe(false);
  });

  it("pagination composes with type filter", async () => {
    const graphId = await createGraph("pag-nodes-filter");
    const ntA = uid("nt");
    const ntB = uid("nt");
    await insertNodeType(graphId, ntA, "TypeA", "type_a");
    await insertNodeType(graphId, ntB, "TypeB", "type_b");

    for (let i = 0; i < 4; i++) await insertNode(graphId, uid("node"), ntA);
    for (let i = 0; i < 2; i++) await insertNode(graphId, uid("node"), ntB);

    const { body } = await fetchList(
      `http://localhost/api/v1/graphs/${graphId}/nodes?type=${ntA}&limit=2`,
    );
    const b = body as { data: unknown[]; pagination: PaginationMeta };
    expect(b.data.length).toBe(2);
    expect(b.pagination.total).toBe(4);
    expect(b.pagination.has_more).toBe(true);
  });

  it("empty node list returns correct pagination", async () => {
    const graphId = await createGraph("pag-nodes-empty");

    const { body } = await fetchList(
      `http://localhost/api/v1/graphs/${graphId}/nodes`,
    );
    const b = body as { data: unknown[]; pagination: PaginationMeta };
    expect(b.data).toEqual([]);
    expect(b.pagination.total).toBe(0);
    expect(b.pagination.has_more).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Edge Pagination Tests
// ---------------------------------------------------------------------------

describe("Pagination — Edges", () => {
  async function setupForEdges() {
    const graphId = await createGraph(`pag-edges-${uid()}`);
    const ntA = uid("nt");
    const ntB = uid("nt");
    const etId = uid("et");
    await insertNodeType(graphId, ntA, "Src", "src");
    await insertNodeType(graphId, ntB, "Tgt", "tgt");
    await insertEdgeType(graphId, etId, "link", "link", ntA, ntB);
    return { graphId, ntA, ntB, etId };
  }

  it("returns pagination metadata for edges", async () => {
    const { graphId, ntA, ntB, etId } = await setupForEdges();
    for (let i = 0; i < 3; i++) {
      const src = uid("src");
      const tgt = uid("tgt");
      await insertNode(graphId, src, ntA);
      await insertNode(graphId, tgt, ntB);
      await insertEdge(graphId, uid("edge"), etId, src, tgt);
    }

    const { status, body } = await fetchList(
      `http://localhost/api/v1/graphs/${graphId}/edges`,
    );
    expect(status).toBe(200);
    const b = body as { data: unknown[]; pagination: PaginationMeta };
    expect(b.data.length).toBe(3);
    expect(b.pagination.total).toBe(3);
    expect(b.pagination.has_more).toBe(false);
  });

  it("paginates edges with limit and offset", async () => {
    const { graphId, ntA, ntB, etId } = await setupForEdges();
    for (let i = 0; i < 5; i++) {
      const src = uid("src");
      const tgt = uid("tgt");
      await insertNode(graphId, src, ntA);
      await insertNode(graphId, tgt, ntB);
      await insertEdge(graphId, uid("edge"), etId, src, tgt);
    }

    const { body } = await fetchList(
      `http://localhost/api/v1/graphs/${graphId}/edges?limit=3&offset=0`,
    );
    const b = body as { data: unknown[]; pagination: PaginationMeta };
    expect(b.data.length).toBe(3);
    expect(b.pagination.total).toBe(5);
    expect(b.pagination.has_more).toBe(true);

    const { body: body2 } = await fetchList(
      `http://localhost/api/v1/graphs/${graphId}/edges?limit=3&offset=3`,
    );
    const b2 = body2 as { data: unknown[]; pagination: PaginationMeta };
    expect(b2.data.length).toBe(2);
    expect(b2.pagination.has_more).toBe(false);
  });

  it("pagination composes with type filter for edges", async () => {
    const { graphId, ntA, ntB, etId } = await setupForEdges();
    const et2 = uid("et");
    await insertEdgeType(graphId, et2, "other", "other", ntA, ntB);

    // 4 edges of type 1, 2 of type 2
    for (let i = 0; i < 4; i++) {
      const src = uid("src");
      const tgt = uid("tgt");
      await insertNode(graphId, src, ntA);
      await insertNode(graphId, tgt, ntB);
      await insertEdge(graphId, uid("edge"), etId, src, tgt);
    }
    for (let i = 0; i < 2; i++) {
      const src = uid("src");
      const tgt = uid("tgt");
      await insertNode(graphId, src, ntA);
      await insertNode(graphId, tgt, ntB);
      await insertEdge(graphId, uid("edge"), et2, src, tgt);
    }

    const { body } = await fetchList(
      `http://localhost/api/v1/graphs/${graphId}/edges?type=${etId}&limit=2`,
    );
    const b = body as { data: unknown[]; pagination: PaginationMeta };
    expect(b.data.length).toBe(2);
    expect(b.pagination.total).toBe(4);
    expect(b.pagination.has_more).toBe(true);
  });

  it("empty edge list returns correct pagination", async () => {
    const { graphId } = await setupForEdges();

    const { body } = await fetchList(
      `http://localhost/api/v1/graphs/${graphId}/edges`,
    );
    const b = body as { data: unknown[]; pagination: PaginationMeta };
    expect(b.data).toEqual([]);
    expect(b.pagination.total).toBe(0);
    expect(b.pagination.has_more).toBe(false);
  });
});

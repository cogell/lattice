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

type ErrorBody = { error: { status: number; message: string } };

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

/** Create a graph via the API and return its ID. */
async function createGraph(name: string): Promise<string> {
  const res = await SELF.fetch("http://localhost/api/v1/graphs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const body = await res.json<{ data: { id: string } }>();
  return body.data.id;
}

/** Insert a node type directly via DB (faster than API for setup). */
async function insertNodeType(
  graphId: string,
  id: string,
  name: string,
  slug: string,
) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO node_types (id, graph_id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, graphId, name, slug, now, now)
    .run();
}

/** Insert a field definition for a node type directly via DB. */
async function insertNodeTypeField(
  nodeTypeId: string,
  id: string,
  slug: string,
  name: string,
  fieldType: string,
  required: number,
  config: string = "{}",
) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO node_type_fields (id, node_type_id, name, slug, field_type, ordinal, required, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, nodeTypeId, name, slug, fieldType, 0, required, config, now, now)
    .run();
}

/** Insert an edge type directly via DB. */
async function insertEdgeType(
  graphId: string,
  id: string,
  name: string,
  slug: string,
  sourceNodeTypeId: string,
  targetNodeTypeId: string,
) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO edge_types (id, graph_id, name, slug, directed, source_node_type_id, target_node_type_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, graphId, name, slug, 1, sourceNodeTypeId, targetNodeTypeId, now, now)
    .run();
}

/** Insert an edge directly via DB. */
async function insertEdge(
  graphId: string,
  id: string,
  edgeTypeId: string,
  sourceNodeId: string,
  targetNodeId: string,
) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO edges (id, graph_id, edge_type_id, source_node_id, target_node_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, graphId, edgeTypeId, sourceNodeId, targetNodeId, "{}", now, now)
    .run();
}

// ---------------------------------------------------------------------------
// API call helpers
// ---------------------------------------------------------------------------

async function createNode(graphId: string, body: object) {
  const res = await SELF.fetch(
    `http://localhost/api/v1/graphs/${graphId}/nodes`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return {
    status: res.status,
    body: await res.json<{ data: NodeData } | ErrorBody>(),
  };
}

type PaginationMeta = { total: number; limit: number; offset: number; has_more: boolean };

async function listNodes(graphId: string, params?: string) {
  const url = params
    ? `http://localhost/api/v1/graphs/${graphId}/nodes?${params}`
    : `http://localhost/api/v1/graphs/${graphId}/nodes`;
  const res = await SELF.fetch(url);
  return {
    status: res.status,
    body: await res.json<{ data: NodeData[]; pagination: PaginationMeta }>(),
  };
}

async function getNode(graphId: string, nodeId: string) {
  const res = await SELF.fetch(
    `http://localhost/api/v1/graphs/${graphId}/nodes/${nodeId}`,
  );
  return {
    status: res.status,
    body: await res.json<{ data: NodeData } | ErrorBody>(),
  };
}

async function updateNode(graphId: string, nodeId: string, body: object) {
  const res = await SELF.fetch(
    `http://localhost/api/v1/graphs/${graphId}/nodes/${nodeId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return {
    status: res.status,
    body: await res.json<{ data: NodeData } | ErrorBody>(),
  };
}

async function deleteNode(graphId: string, nodeId: string) {
  return SELF.fetch(
    `http://localhost/api/v1/graphs/${graphId}/nodes/${nodeId}`,
    { method: "DELETE" },
  );
}

// ---------------------------------------------------------------------------
// Unique counter for isolation between tests
// ---------------------------------------------------------------------------
let counter = 0;
function uid() {
  return `n-test-${++counter}-${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Node CRUD", () => {
  // --- CREATE ---

  it("POST creates node with valid data (201)", async () => {
    const graphId = await createGraph("create-node-1");
    const ntId = uid();
    await insertNodeType(graphId, ntId, "Person", "person");
    await insertNodeTypeField(ntId, uid(), "name", "Name", "text", 0);

    const { status, body } = await createNode(graphId, {
      node_type_id: ntId,
      data: { name: "Alice" },
    });

    expect(status).toBe(201);
    const data = (body as { data: NodeData }).data;
    expect(data.id).toBeTruthy();
    expect(data.graph_id).toBe(graphId);
    expect(data.node_type_id).toBe(ntId);
    expect(data.data).toEqual({ name: "Alice" });
    expect(data.created_at).toBeTruthy();
    expect(data.updated_at).toBeTruthy();
  });

  it("POST with empty data object when type has no required fields (201)", async () => {
    const graphId = await createGraph("create-node-empty");
    const ntId = uid();
    await insertNodeType(graphId, ntId, "Tag", "tag");
    // No fields defined — so no required fields

    const { status, body } = await createNode(graphId, {
      node_type_id: ntId,
      data: {},
    });

    expect(status).toBe(201);
    const data = (body as { data: NodeData }).data;
    expect(data.data).toEqual({});
  });

  it("POST rejects missing node_type_id (400)", async () => {
    const graphId = await createGraph("create-node-no-type");

    const { status, body } = await createNode(graphId, { data: {} });

    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("node_type_id");
  });

  it("POST rejects node_type_id from different graph (400)", async () => {
    const graphId = await createGraph("create-node-wrong-graph");
    const otherGraphId = await createGraph("create-node-other-graph");
    const ntId = uid();
    await insertNodeType(otherGraphId, ntId, "Alien", "alien");

    const { status, body } = await createNode(graphId, {
      node_type_id: ntId,
      data: {},
    });

    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("not found in this graph");
  });

  it("POST rejects non-existent node_type_id (400)", async () => {
    const graphId = await createGraph("create-node-bad-type");

    const { status, body } = await createNode(graphId, {
      node_type_id: "nonexistent-type-id",
      data: {},
    });

    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("not found");
  });

  // --- LIST ---

  it("GET lists all nodes in graph", async () => {
    const graphId = await createGraph("list-nodes-all");
    const ntId = uid();
    await insertNodeType(graphId, ntId, "Item", "item");

    await createNode(graphId, { node_type_id: ntId, data: {} });
    await createNode(graphId, { node_type_id: ntId, data: {} });

    const { status, body } = await listNodes(graphId);

    expect(status).toBe(200);
    expect(body.data.length).toBe(2);
  });

  it("GET with ?type= filters by node_type_id", async () => {
    const graphId = await createGraph("list-nodes-filter");
    const ntA = uid();
    const ntB = uid();
    await insertNodeType(graphId, ntA, "TypeA", "type_a");
    await insertNodeType(graphId, ntB, "TypeB", "type_b");

    await createNode(graphId, { node_type_id: ntA, data: {} });
    await createNode(graphId, { node_type_id: ntA, data: {} });
    await createNode(graphId, { node_type_id: ntB, data: {} });

    const { status, body } = await listNodes(graphId, `type=${ntA}`);

    expect(status).toBe(200);
    expect(body.data.length).toBe(2);
    expect(body.data.every((n) => n.node_type_id === ntA)).toBe(true);
  });

  it("GET returns empty array when no nodes exist", async () => {
    const graphId = await createGraph("list-nodes-empty");

    const { status, body } = await listNodes(graphId);

    expect(status).toBe(200);
    expect(body.data).toEqual([]);
  });

  // --- GET ---

  it("GET /:nodeId returns node with parsed data", async () => {
    const graphId = await createGraph("get-node-ok");
    const ntId = uid();
    await insertNodeType(graphId, ntId, "Doc", "doc");
    await insertNodeTypeField(ntId, uid(), "title", "Title", "text", 0);

    const { body: created } = await createNode(graphId, {
      node_type_id: ntId,
      data: { title: "My Doc" },
    });
    const nodeId = (created as { data: NodeData }).data.id;

    const { status, body } = await getNode(graphId, nodeId);

    expect(status).toBe(200);
    const data = (body as { data: NodeData }).data;
    expect(data.id).toBe(nodeId);
    expect(data.data).toEqual({ title: "My Doc" });
    expect(typeof data.data).toBe("object"); // parsed, not string
  });

  it("GET /:nodeId returns 404 for non-existent node", async () => {
    const graphId = await createGraph("get-node-404");

    const { status, body } = await getNode(graphId, "nonexistent-node-id");

    expect(status).toBe(404);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("not found");
  });

  // --- UPDATE ---

  it("PATCH updates data fields and merges with existing", async () => {
    const graphId = await createGraph("update-node-merge");
    const ntId = uid();
    await insertNodeType(graphId, ntId, "Profile", "profile");
    await insertNodeTypeField(ntId, uid(), "first", "First", "text", 0);
    await insertNodeTypeField(ntId, uid(), "last", "Last", "text", 0);

    const { body: created } = await createNode(graphId, {
      node_type_id: ntId,
      data: { first: "Jane", last: "Doe" },
    });
    const nodeId = (created as { data: NodeData }).data.id;

    const { status, body } = await updateNode(graphId, nodeId, {
      data: { last: "Smith" },
    });

    expect(status).toBe(200);
    const data = (body as { data: NodeData }).data;
    expect(data.data).toEqual({ first: "Jane", last: "Smith" });
  });

  it("PATCH preserves fields not in update payload", async () => {
    const graphId = await createGraph("update-node-preserve");
    const ntId = uid();
    await insertNodeType(graphId, ntId, "Contact", "contact");
    await insertNodeTypeField(ntId, uid(), "email", "Email", "email", 0);
    await insertNodeTypeField(ntId, uid(), "phone", "Phone", "text", 0);

    const { body: created } = await createNode(graphId, {
      node_type_id: ntId,
      data: { email: "a@b.com", phone: "555-0100" },
    });
    const nodeId = (created as { data: NodeData }).data.id;

    // Update only email
    const { status, body } = await updateNode(graphId, nodeId, {
      data: { email: "new@b.com" },
    });

    expect(status).toBe(200);
    const data = (body as { data: NodeData }).data;
    expect(data.data.email).toBe("new@b.com");
    expect(data.data.phone).toBe("555-0100");
  });

  it("PATCH returns 404 for non-existent node", async () => {
    const graphId = await createGraph("update-node-404");

    const { status, body } = await updateNode(graphId, "nonexistent-node-id", {
      data: { foo: "bar" },
    });

    expect(status).toBe(404);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("not found");
  });

  // --- DELETE ---

  it("DELETE returns 204 and removes node", async () => {
    const graphId = await createGraph("delete-node-ok");
    const ntId = uid();
    await insertNodeType(graphId, ntId, "Temp", "temp");

    const { body: created } = await createNode(graphId, {
      node_type_id: ntId,
      data: {},
    });
    const nodeId = (created as { data: NodeData }).data.id;

    const res = await deleteNode(graphId, nodeId);
    expect(res.status).toBe(204);

    // Verify it's gone
    const { status } = await getNode(graphId, nodeId);
    expect(status).toBe(404);
  });

  it("DELETE returns 404 for non-existent node", async () => {
    const graphId = await createGraph("delete-node-404");

    const res = await deleteNode(graphId, "nonexistent-node-id");
    expect(res.status).toBe(404);
  });

  it("DELETE cascades to connected edges", async () => {
    const graphId = await createGraph("delete-node-cascade");
    const ntA = uid();
    const ntB = uid();
    await insertNodeType(graphId, ntA, "Source", "source");
    await insertNodeType(graphId, ntB, "Target", "target");

    // Create two nodes
    const { body: srcBody } = await createNode(graphId, {
      node_type_id: ntA,
      data: {},
    });
    const srcId = (srcBody as { data: NodeData }).data.id;

    const { body: tgtBody } = await createNode(graphId, {
      node_type_id: ntB,
      data: {},
    });
    const tgtId = (tgtBody as { data: NodeData }).data.id;

    // Create edge type and edge via DB
    const etId = uid();
    await insertEdgeType(graphId, etId, "connects", "connects", ntA, ntB);
    const edgeId = uid();
    await insertEdge(graphId, edgeId, etId, srcId, tgtId);

    // Verify edge exists
    const edgeBefore = await env.DB.prepare(
      "SELECT id FROM edges WHERE id = ?",
    )
      .bind(edgeId)
      .first();
    expect(edgeBefore).toBeTruthy();

    // Delete the source node
    const res = await deleteNode(graphId, srcId);
    expect(res.status).toBe(204);

    // Verify the edge is gone
    const edgeAfter = await env.DB.prepare(
      "SELECT id FROM edges WHERE id = ?",
    )
      .bind(edgeId)
      .first();
    expect(edgeAfter).toBeNull();

    // Target node should still exist
    const { status: tgtStatus } = await getNode(graphId, tgtId);
    expect(tgtStatus).toBe(200);
  });

  // --- DATA VALIDATION ---

  it("POST rejects unknown fields not in type definition", async () => {
    const graphId = await createGraph("validate-unknown-field");
    const ntId = uid();
    await insertNodeType(graphId, ntId, "Strict", "strict");
    await insertNodeTypeField(ntId, uid(), "title", "Title", "text", 1);

    const { status, body } = await createNode(graphId, {
      node_type_id: ntId,
      data: { title: "ok", bogus: "nope" },
    });

    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("bogus");
  });

  it("POST rejects missing required field", async () => {
    const graphId = await createGraph("validate-required");
    const ntId = uid();
    await insertNodeType(graphId, ntId, "Req", "req");
    await insertNodeTypeField(ntId, uid(), "title", "Title", "text", 1);

    const { status, body } = await createNode(graphId, {
      node_type_id: ntId,
      data: {},
    });

    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("required");
  });

  it("POST rejects wrong type (number where text expected)", async () => {
    const graphId = await createGraph("validate-wrong-type");
    const ntId = uid();
    await insertNodeType(graphId, ntId, "Typed", "typed");
    await insertNodeTypeField(ntId, uid(), "title", "Title", "text", 0);

    const { status, body } = await createNode(graphId, {
      node_type_id: ntId,
      data: { title: 42 },
    });

    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("text");
  });

  it("POST validates select field options", async () => {
    const graphId = await createGraph("validate-select");
    const ntId = uid();
    await insertNodeType(graphId, ntId, "Sel", "sel");
    await insertNodeTypeField(
      ntId,
      uid(),
      "status",
      "Status",
      "select",
      0,
      JSON.stringify({ options: ["active", "inactive"] }),
    );

    const { status, body } = await createNode(graphId, {
      node_type_id: ntId,
      data: { status: "deleted" },
    });

    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("not a valid option");
  });

  it("POST validates multi_select field options", async () => {
    const graphId = await createGraph("validate-multiselect");
    const ntId = uid();
    await insertNodeType(graphId, ntId, "Multi", "multi");
    await insertNodeTypeField(
      ntId,
      uid(),
      "tags",
      "Tags",
      "multi_select",
      0,
      JSON.stringify({ options: ["a", "b", "c"] }),
    );

    const { status, body } = await createNode(graphId, {
      node_type_id: ntId,
      data: { tags: ["a", "x"] },
    });

    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("x");
  });

  it("PATCH rejects unknown fields in update", async () => {
    const graphId = await createGraph("validate-patch-unknown");
    const ntId = uid();
    await insertNodeType(graphId, ntId, "PatchStrict", "patch_strict");
    await insertNodeTypeField(ntId, uid(), "title", "Title", "text", 0);

    const { body: created } = await createNode(graphId, {
      node_type_id: ntId,
      data: { title: "hi" },
    });
    const nodeId = (created as { data: NodeData }).data.id;

    const { status, body } = await updateNode(graphId, nodeId, {
      data: { unknown_field: "bad" },
    });

    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("unknown_field");
  });

  it("PATCH validates field types in update", async () => {
    const graphId = await createGraph("validate-patch-type");
    const ntId = uid();
    await insertNodeType(graphId, ntId, "PatchTyped", "patch_typed");
    await insertNodeTypeField(ntId, uid(), "count", "Count", "number", 0);

    const { body: created } = await createNode(graphId, {
      node_type_id: ntId,
      data: { count: 5 },
    });
    const nodeId = (created as { data: NodeData }).data.id;

    const { status, body } = await updateNode(graphId, nodeId, {
      data: { count: "not-a-number" },
    });

    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("number");
  });
});

import { env, SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import "../src/index";

type GraphData = {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type EdgeTypeData = {
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

type ErrorBody = { error: { status: number; message: string } };

// Helper: create a graph via API
async function createGraph(name: string) {
  const res = await SELF.fetch("http://localhost/api/v1/graphs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const body = await res.json<{ data: GraphData }>();
  return body.data;
}

// Helper: insert node types directly in DB
async function insertNodeType(id: string, graphId: string, name: string, slug: string) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO node_types (id, graph_id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, graphId, name, slug, now, now)
    .run();
}

// Helper: scaffold a graph with two node types, returns { graphId, sourceNodeTypeId, targetNodeTypeId }
async function scaffold() {
  const graph = await createGraph("ET Test Graph");
  const graphId = graph.id;
  const sourceNodeTypeId = "nt-src-" + graphId.slice(0, 8);
  const targetNodeTypeId = "nt-tgt-" + graphId.slice(0, 8);
  await insertNodeType(sourceNodeTypeId, graphId, "Person", "person");
  await insertNodeType(targetNodeTypeId, graphId, "Organization", "organization");
  return { graphId, sourceNodeTypeId, targetNodeTypeId };
}

// Helper: base URL for edge types
function edgeTypesUrl(graphId: string) {
  return `http://localhost/api/v1/graphs/${graphId}/edge-types`;
}

// Helper: create an edge type via API
async function createEdgeType(
  graphId: string,
  data: {
    name?: string;
    directed?: boolean;
    source_node_type_id?: string;
    target_node_type_id?: string;
  },
) {
  const res = await SELF.fetch(edgeTypesUrl(graphId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return {
    status: res.status,
    body: await res.json<{ data: EdgeTypeData } | ErrorBody>(),
  };
}

// Helper: list edge types
async function listEdgeTypes(graphId: string) {
  const res = await SELF.fetch(edgeTypesUrl(graphId));
  return {
    status: res.status,
    body: await res.json<{ data: EdgeTypeData[] }>(),
  };
}

// Helper: get edge type by ID
async function getEdgeType(graphId: string, edgeTypeId: string) {
  const res = await SELF.fetch(`${edgeTypesUrl(graphId)}/${edgeTypeId}`);
  return {
    status: res.status,
    body: await res.json<{ data: EdgeTypeData } | ErrorBody>(),
  };
}

// Helper: update edge type
async function updateEdgeType(
  graphId: string,
  edgeTypeId: string,
  data: {
    name?: string;
    directed?: boolean;
    source_node_type_id?: string;
    target_node_type_id?: string;
  },
) {
  const res = await SELF.fetch(`${edgeTypesUrl(graphId)}/${edgeTypeId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return {
    status: res.status,
    body: await res.json<{ data: EdgeTypeData } | ErrorBody>(),
  };
}

// Helper: delete edge type
async function deleteEdgeType(graphId: string, edgeTypeId: string) {
  return SELF.fetch(`${edgeTypesUrl(graphId)}/${edgeTypeId}`, {
    method: "DELETE",
  });
}

describe("Edge Type CRUD", () => {
  // --- POST ---

  it("POST creates edge type with auto-generated slug (201)", async () => {
    const { graphId, sourceNodeTypeId, targetNodeTypeId } = await scaffold();
    const { status, body } = await createEdgeType(graphId, {
      name: "Works At",
      source_node_type_id: sourceNodeTypeId,
      target_node_type_id: targetNodeTypeId,
    });
    expect(status).toBe(201);
    const data = (body as { data: EdgeTypeData }).data;
    expect(data.name).toBe("Works At");
    expect(data.slug).toBe("works_at");
    expect(data.directed).toBe(true); // default true
    expect(data.source_node_type_id).toBe(sourceNodeTypeId);
    expect(data.target_node_type_id).toBe(targetNodeTypeId);
    expect(data.graph_id).toBe(graphId);
    expect(data.id).toBeTruthy();
    expect(data.created_at).toBeTruthy();
    expect(data.updated_at).toBeTruthy();
  });

  it("POST rejects empty name (400)", async () => {
    const { graphId, sourceNodeTypeId, targetNodeTypeId } = await scaffold();
    const { status, body } = await createEdgeType(graphId, {
      name: "   ",
      source_node_type_id: sourceNodeTypeId,
      target_node_type_id: targetNodeTypeId,
    });
    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("name");
  });

  it("POST rejects missing source_node_type_id (400)", async () => {
    const { graphId, targetNodeTypeId } = await scaffold();
    const { status, body } = await createEdgeType(graphId, {
      name: "Missing Source",
      target_node_type_id: targetNodeTypeId,
    });
    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("source_node_type_id");
  });

  it("POST rejects missing target_node_type_id (400)", async () => {
    const { graphId, sourceNodeTypeId } = await scaffold();
    const { status, body } = await createEdgeType(graphId, {
      name: "Missing Target",
      source_node_type_id: sourceNodeTypeId,
    });
    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("target_node_type_id");
  });

  it("POST validates source node type exists in same graph (400)", async () => {
    const { graphId, targetNodeTypeId } = await scaffold();
    const { status, body } = await createEdgeType(graphId, {
      name: "Bad Source",
      source_node_type_id: "nonexistent-node-type",
      target_node_type_id: targetNodeTypeId,
    });
    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("Source node type");
  });

  it("POST validates target node type exists in same graph (400)", async () => {
    const { graphId, sourceNodeTypeId } = await scaffold();
    const { status, body } = await createEdgeType(graphId, {
      name: "Bad Target",
      source_node_type_id: sourceNodeTypeId,
      target_node_type_id: "nonexistent-node-type",
    });
    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("Target node type");
  });

  it("POST rejects duplicate name within same graph (409)", async () => {
    const { graphId, sourceNodeTypeId, targetNodeTypeId } = await scaffold();

    // Create the first edge type
    const { status: firstStatus } = await createEdgeType(graphId, {
      name: "Duplicate Name",
      source_node_type_id: sourceNodeTypeId,
      target_node_type_id: targetNodeTypeId,
    });
    expect(firstStatus).toBe(201);

    // Try to create another with the same name
    const { status, body } = await createEdgeType(graphId, {
      name: "Duplicate Name",
      source_node_type_id: sourceNodeTypeId,
      target_node_type_id: targetNodeTypeId,
    });
    expect(status).toBe(409);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("already exists");
  });

  it("POST stores directed flag correctly (default true)", async () => {
    const { graphId, sourceNodeTypeId, targetNodeTypeId } = await scaffold();

    // Default: directed = true
    const { body: body1 } = await createEdgeType(graphId, {
      name: "Directed Edge",
      source_node_type_id: sourceNodeTypeId,
      target_node_type_id: targetNodeTypeId,
    });
    const data1 = (body1 as { data: EdgeTypeData }).data;
    expect(data1.directed).toBe(true);

    // Explicitly false
    const { body: body2 } = await createEdgeType(graphId, {
      name: "Undirected Edge",
      directed: false,
      source_node_type_id: sourceNodeTypeId,
      target_node_type_id: targetNodeTypeId,
    });
    const data2 = (body2 as { data: EdgeTypeData }).data;
    expect(data2.directed).toBe(false);
  });

  // --- GET (list) ---

  it("GET lists all edge types for graph (200)", async () => {
    const { graphId, sourceNodeTypeId, targetNodeTypeId } = await scaffold();

    // Create a few edge types
    await createEdgeType(graphId, {
      name: "Works At",
      source_node_type_id: sourceNodeTypeId,
      target_node_type_id: targetNodeTypeId,
    });
    await createEdgeType(graphId, {
      name: "Reports To",
      source_node_type_id: sourceNodeTypeId,
      target_node_type_id: targetNodeTypeId,
    });

    const { status, body } = await listEdgeTypes(graphId);
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(2);
    for (const et of body.data) {
      expect(et.graph_id).toBe(graphId);
    }
  });

  // --- GET (single) ---

  it("GET single edge type by ID (200)", async () => {
    const { graphId, sourceNodeTypeId, targetNodeTypeId } = await scaffold();
    const { body: created } = await createEdgeType(graphId, {
      name: "Reports To",
      source_node_type_id: sourceNodeTypeId,
      target_node_type_id: targetNodeTypeId,
    });
    const createdData = (created as { data: EdgeTypeData }).data;

    const { status, body } = await getEdgeType(graphId, createdData.id);
    expect(status).toBe(200);
    const data = (body as { data: EdgeTypeData }).data;
    expect(data.id).toBe(createdData.id);
    expect(data.name).toBe("Reports To");
    expect(data.slug).toBe("reports_to");
  });

  it("GET returns 404 for non-existent edge type", async () => {
    const { graphId } = await scaffold();
    const { status, body } = await getEdgeType(graphId, "nonexistent-edge-type-id");
    expect(status).toBe(404);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("not found");
  });

  // --- PATCH ---

  it("PATCH updates name (200)", async () => {
    const { graphId, sourceNodeTypeId, targetNodeTypeId } = await scaffold();
    const { body: created } = await createEdgeType(graphId, {
      name: "Knows",
      source_node_type_id: sourceNodeTypeId,
      target_node_type_id: targetNodeTypeId,
    });
    const createdData = (created as { data: EdgeTypeData }).data;

    const { status, body } = await updateEdgeType(graphId, createdData.id, {
      name: "Knows Updated",
    });
    expect(status).toBe(200);
    const data = (body as { data: EdgeTypeData }).data;
    expect(data.name).toBe("Knows Updated");
    // Slug remains unchanged (immutable)
    expect(data.slug).toBe("knows");
    expect(data.updated_at).not.toBe(data.created_at);
  });

  it("PATCH updates directed flag (200)", async () => {
    const { graphId, sourceNodeTypeId, targetNodeTypeId } = await scaffold();
    const { body: created } = await createEdgeType(graphId, {
      name: "Friends With",
      directed: true,
      source_node_type_id: sourceNodeTypeId,
      target_node_type_id: targetNodeTypeId,
    });
    const createdData = (created as { data: EdgeTypeData }).data;
    expect(createdData.directed).toBe(true);

    const { status, body } = await updateEdgeType(graphId, createdData.id, {
      directed: false,
    });
    expect(status).toBe(200);
    const data = (body as { data: EdgeTypeData }).data;
    expect(data.directed).toBe(false);
  });

  it("PATCH rejects changing source_node_type_id (400)", async () => {
    const { graphId, sourceNodeTypeId, targetNodeTypeId } = await scaffold();
    const { body: created } = await createEdgeType(graphId, {
      name: "Immutable Source Test",
      source_node_type_id: sourceNodeTypeId,
      target_node_type_id: targetNodeTypeId,
    });
    const createdData = (created as { data: EdgeTypeData }).data;

    const { status, body } = await updateEdgeType(graphId, createdData.id, {
      source_node_type_id: "some-other-id",
    });
    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("immutable");
  });

  it("PATCH rejects changing target_node_type_id (400)", async () => {
    const { graphId, sourceNodeTypeId, targetNodeTypeId } = await scaffold();
    const { body: created } = await createEdgeType(graphId, {
      name: "Immutable Target Test",
      source_node_type_id: sourceNodeTypeId,
      target_node_type_id: targetNodeTypeId,
    });
    const createdData = (created as { data: EdgeTypeData }).data;

    const { status, body } = await updateEdgeType(graphId, createdData.id, {
      target_node_type_id: "some-other-id",
    });
    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("immutable");
  });

  it("PATCH rejects duplicate name (409)", async () => {
    const { graphId, sourceNodeTypeId, targetNodeTypeId } = await scaffold();

    // Create two edge types
    await createEdgeType(graphId, {
      name: "Existing Name",
      source_node_type_id: sourceNodeTypeId,
      target_node_type_id: targetNodeTypeId,
    });
    const { body: created } = await createEdgeType(graphId, {
      name: "To Be Renamed",
      source_node_type_id: sourceNodeTypeId,
      target_node_type_id: targetNodeTypeId,
    });
    const createdData = (created as { data: EdgeTypeData }).data;

    // Try to rename to the existing name
    const { status, body } = await updateEdgeType(graphId, createdData.id, {
      name: "Existing Name",
    });
    expect(status).toBe(409);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("already exists");
  });

  // --- DELETE ---

  it("DELETE removes edge type (204)", async () => {
    const { graphId, sourceNodeTypeId, targetNodeTypeId } = await scaffold();
    const { body: created } = await createEdgeType(graphId, {
      name: "Delete Me",
      source_node_type_id: sourceNodeTypeId,
      target_node_type_id: targetNodeTypeId,
    });
    const createdData = (created as { data: EdgeTypeData }).data;

    const res = await deleteEdgeType(graphId, createdData.id);
    expect(res.status).toBe(204);

    // Verify it's gone
    const { status } = await getEdgeType(graphId, createdData.id);
    expect(status).toBe(404);
  });

  it("DELETE cascades to edges of that type", async () => {
    const { graphId, sourceNodeTypeId, targetNodeTypeId } = await scaffold();

    // Create an edge type
    const { body: created } = await createEdgeType(graphId, {
      name: "Cascade Test Edge Type",
      source_node_type_id: sourceNodeTypeId,
      target_node_type_id: targetNodeTypeId,
    });
    const edgeTypeData = (created as { data: EdgeTypeData }).data;

    // Insert nodes and an edge directly in DB
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO nodes (id, graph_id, node_type_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind("node-et-cascade-1", graphId, sourceNodeTypeId, "{}", now, now),
      env.DB.prepare(
        "INSERT INTO nodes (id, graph_id, node_type_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind("node-et-cascade-2", graphId, targetNodeTypeId, "{}", now, now),
      env.DB.prepare(
        "INSERT INTO edges (id, graph_id, edge_type_id, source_node_id, target_node_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(
        "edge-et-cascade-1",
        graphId,
        edgeTypeData.id,
        "node-et-cascade-1",
        "node-et-cascade-2",
        "{}",
        now,
        now,
      ),
    ]);

    // Verify edge exists
    const edgeBefore = await env.DB.prepare("SELECT id FROM edges WHERE id = ?")
      .bind("edge-et-cascade-1")
      .first();
    expect(edgeBefore).toBeTruthy();

    // Delete the edge type
    const res = await deleteEdgeType(graphId, edgeTypeData.id);
    expect(res.status).toBe(204);

    // Verify cascade deleted the edge
    const edgeAfter = await env.DB.prepare("SELECT id FROM edges WHERE id = ?")
      .bind("edge-et-cascade-1")
      .first();
    expect(edgeAfter).toBeNull();
  });
});

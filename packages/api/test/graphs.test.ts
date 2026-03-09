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

type ErrorBody = { error: { status: number; message: string } };

// Helper: create a graph
async function createGraph(data: { name?: string; description?: string } = {}) {
  const res = await SELF.fetch("http://localhost/api/v1/graphs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return {
    status: res.status,
    body: await res.json<{ data: GraphData } | ErrorBody>(),
  };
}

type PaginationMeta = { total: number; limit: number; offset: number; has_more: boolean };

// Helper: list graphs
async function listGraphs(params?: string) {
  const url = params
    ? `http://localhost/api/v1/graphs?${params}`
    : "http://localhost/api/v1/graphs";
  const res = await SELF.fetch(url);
  return {
    status: res.status,
    body: await res.json<{ data: GraphData[]; pagination: PaginationMeta }>(),
  };
}

// Helper: get a graph by ID
async function getGraph(id: string) {
  const res = await SELF.fetch(`http://localhost/api/v1/graphs/${id}`);
  return {
    status: res.status,
    body: await res.json<{ data: GraphData } | ErrorBody>(),
  };
}

// Helper: update a graph
async function updateGraph(id: string, data: { name?: string; description?: string }) {
  const res = await SELF.fetch(`http://localhost/api/v1/graphs/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return {
    status: res.status,
    body: await res.json<{ data: GraphData } | ErrorBody>(),
  };
}

// Helper: delete a graph
async function deleteGraph(id: string) {
  return SELF.fetch(`http://localhost/api/v1/graphs/${id}`, {
    method: "DELETE",
  });
}

// Helper: insert a second user directly into DB (to test ownership isolation)
async function insertOtherUser() {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO users (id, email, name, email_verified) VALUES (?, ?, ?, 1)",
  )
    .bind("01OTHER_USER_ID_000000000", "other@example.com", "Other User")
    .run();
}

// Helper: create a graph owned by the other user directly in DB
async function insertOtherUserGraph(id: string, name: string) {
  await insertOtherUser();
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO graphs (id, name, description, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, name, null, "01OTHER_USER_ID_000000000", now, now)
    .run();
}

describe("Graph CRUD", () => {
  it("POST creates graph with 201 and owner set", async () => {
    const { status, body } = await createGraph({
      name: "Test Graph",
      description: "A test",
    });
    expect(status).toBe(201);
    const data = (body as { data: GraphData }).data;
    expect(data.name).toBe("Test Graph");
    expect(data.description).toBe("A test");
    expect(data.created_by).toBe("01AAAAAAAAAAAAAAAAAAAADEV");
    expect(data.id).toBeTruthy();
    expect(data.created_at).toBeTruthy();
    expect(data.updated_at).toBeTruthy();
  });

  it("POST creates graph without description", async () => {
    const { status, body } = await createGraph({ name: "No Desc" });
    expect(status).toBe(201);
    const data = (body as { data: GraphData }).data;
    expect(data.name).toBe("No Desc");
    expect(data.description).toBeNull();
  });

  it("POST rejects missing name with 400", async () => {
    const { status, body } = await createGraph({});
    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("name");
  });

  it("POST rejects empty name with 400", async () => {
    const { status, body } = await createGraph({ name: "   " });
    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("name");
  });

  it("GET lists only graphs owned by authenticated user", async () => {
    // Create a graph as the dev user
    const { body: created } = await createGraph({ name: "My Graph" });
    const myId = (created as { data: GraphData }).data.id;

    // Insert a graph owned by another user directly in DB
    await insertOtherUserGraph("other-graph-id-001", "Other's Graph");

    const { status, body } = await listGraphs();
    expect(status).toBe(200);
    const ids = body.data.map((g) => g.id);
    expect(ids).toContain(myId);
    expect(ids).not.toContain("other-graph-id-001");
  });

  it("GET /:graphId returns graph details for owner", async () => {
    const { body: created } = await createGraph({ name: "Detail Graph" });
    const id = (created as { data: GraphData }).data.id;

    const { status, body } = await getGraph(id);
    expect(status).toBe(200);
    const data = (body as { data: GraphData }).data;
    expect(data.id).toBe(id);
    expect(data.name).toBe("Detail Graph");
  });

  it("GET /:graphId returns 403 for non-owner", async () => {
    await insertOtherUserGraph("other-graph-id-002", "Forbidden Graph");

    const { status, body } = await getGraph("other-graph-id-002");
    expect(status).toBe(403);
    const err = body as ErrorBody;
    expect(err.error.message).toBe("Forbidden");
  });

  it("GET /:graphId returns 404 for non-existent graph", async () => {
    const { status, body } = await getGraph("nonexistent-graph-id");
    expect(status).toBe(404);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("not found");
  });

  it("PATCH updates name and description", async () => {
    const { body: created } = await createGraph({
      name: "Original",
      description: "Old desc",
    });
    const id = (created as { data: GraphData }).data.id;

    const { status, body } = await updateGraph(id, {
      name: "Updated",
      description: "New desc",
    });
    expect(status).toBe(200);
    const data = (body as { data: GraphData }).data;
    expect(data.name).toBe("Updated");
    expect(data.description).toBe("New desc");
    expect(data.updated_at).not.toBe(data.created_at);
  });

  it("PATCH updates only name, preserves description", async () => {
    const { body: created } = await createGraph({
      name: "Partial",
      description: "Keep me",
    });
    const id = (created as { data: GraphData }).data.id;

    const { status, body } = await updateGraph(id, { name: "Partial Updated" });
    expect(status).toBe(200);
    const data = (body as { data: GraphData }).data;
    expect(data.name).toBe("Partial Updated");
    expect(data.description).toBe("Keep me");
  });

  it("PATCH rejects empty name with 400", async () => {
    const { body: created } = await createGraph({ name: "NoEmpty" });
    const id = (created as { data: GraphData }).data.id;

    const { status, body } = await updateGraph(id, { name: "   " });
    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("name");
  });

  it("PATCH returns 403 for non-owner", async () => {
    await insertOtherUserGraph("other-graph-id-003", "Not Mine");

    const { status } = await updateGraph("other-graph-id-003", { name: "Hacked" });
    expect(status).toBe(403);
  });

  it("DELETE returns 204 and removes graph", async () => {
    const { body: created } = await createGraph({ name: "Delete Me" });
    const id = (created as { data: GraphData }).data.id;

    const res = await deleteGraph(id);
    expect(res.status).toBe(204);

    // Verify it's gone
    const { status } = await getGraph(id);
    expect(status).toBe(404);
  });

  it("DELETE cascades to related data", async () => {
    const { body: created } = await createGraph({ name: "Cascade Test" });
    const graphId = (created as { data: GraphData }).data.id;

    // Insert a node type, node, edge type, and edge to verify cascade
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO node_types (id, graph_id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind("nt-cascade-1", graphId, "Person", "person", now, now),
      env.DB.prepare(
        "INSERT INTO node_types (id, graph_id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind("nt-cascade-2", graphId, "Org", "org", now, now),
      env.DB.prepare(
        "INSERT INTO nodes (id, graph_id, node_type_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind("node-cascade-1", graphId, "nt-cascade-1", "{}", now, now),
      env.DB.prepare(
        "INSERT INTO nodes (id, graph_id, node_type_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind("node-cascade-2", graphId, "nt-cascade-2", "{}", now, now),
      env.DB.prepare(
        "INSERT INTO edge_types (id, graph_id, name, slug, directed, source_node_type_id, target_node_type_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind("et-cascade-1", graphId, "knows", "knows", 1, "nt-cascade-1", "nt-cascade-2", now, now),
      env.DB.prepare(
        "INSERT INTO edges (id, graph_id, edge_type_id, source_node_id, target_node_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind("edge-cascade-1", graphId, "et-cascade-1", "node-cascade-1", "node-cascade-2", "{}", now, now),
    ]);

    // Delete the graph
    const res = await deleteGraph(graphId);
    expect(res.status).toBe(204);

    // Verify all related data is gone
    const nodes = await env.DB.prepare("SELECT id FROM nodes WHERE graph_id = ?").bind(graphId).all();
    expect(nodes.results.length).toBe(0);

    const edges = await env.DB.prepare("SELECT id FROM edges WHERE graph_id = ?").bind(graphId).all();
    expect(edges.results.length).toBe(0);

    const nodeTypes = await env.DB.prepare("SELECT id FROM node_types WHERE graph_id = ?").bind(graphId).all();
    expect(nodeTypes.results.length).toBe(0);

    const edgeTypes = await env.DB.prepare("SELECT id FROM edge_types WHERE graph_id = ?").bind(graphId).all();
    expect(edgeTypes.results.length).toBe(0);
  });

  it("DELETE returns 403 for non-owner", async () => {
    await insertOtherUserGraph("other-graph-id-004", "Not Deletable");

    const res = await deleteGraph("other-graph-id-004");
    expect(res.status).toBe(403);
  });

  it("DELETE returns 404 for non-existent graph", async () => {
    const res = await deleteGraph("nonexistent-delete-id");
    expect(res.status).toBe(404);
  });
});

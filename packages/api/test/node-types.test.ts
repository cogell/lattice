import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import "../src/index";

type NodeTypeData = {
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

type ErrorBody = { error: { status: number; message: string } };

// Helper: create a graph (needed to scope node types)
async function createGraph(name: string) {
  const res = await SELF.fetch("http://localhost/api/v1/graphs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const body = await res.json<{ data: { id: string } }>();
  return body.data.id;
}

// Helper: create a node type
async function createNodeType(
  graphId: string,
  data: { name?: string; color?: string; icon?: string } = {},
) {
  const res = await SELF.fetch(
    `http://localhost/api/v1/graphs/${graphId}/node-types`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
  );
  return {
    status: res.status,
    body: await res.json<{ data: NodeTypeData } | ErrorBody>(),
  };
}

// Helper: list node types
async function listNodeTypes(graphId: string) {
  const res = await SELF.fetch(
    `http://localhost/api/v1/graphs/${graphId}/node-types`,
  );
  return {
    status: res.status,
    body: await res.json<{ data: NodeTypeData[] }>(),
  };
}

// Helper: get a node type
async function getNodeType(graphId: string, nodeTypeId: string) {
  const res = await SELF.fetch(
    `http://localhost/api/v1/graphs/${graphId}/node-types/${nodeTypeId}`,
  );
  return {
    status: res.status,
    body: await res.json<{ data: NodeTypeData } | ErrorBody>(),
  };
}

// Helper: update a node type
async function updateNodeType(
  graphId: string,
  nodeTypeId: string,
  data: {
    name?: string;
    color?: string | null;
    icon?: string | null;
    display_field_slug?: string | null;
  },
) {
  const res = await SELF.fetch(
    `http://localhost/api/v1/graphs/${graphId}/node-types/${nodeTypeId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
  );
  return {
    status: res.status,
    body: await res.json<{ data: NodeTypeData } | ErrorBody>(),
  };
}

// Helper: delete a node type
async function deleteNodeType(graphId: string, nodeTypeId: string) {
  return SELF.fetch(
    `http://localhost/api/v1/graphs/${graphId}/node-types/${nodeTypeId}`,
    { method: "DELETE" },
  );
}

describe("Node Type CRUD", () => {
  let graphId: string;

  beforeAll(async () => {
    graphId = await createGraph("Node Type Test Graph");
  });

  it("POST creates node type with auto-generated slug (201)", async () => {
    const { status, body } = await createNodeType(graphId, {
      name: "Person",
      color: "#FF0000",
      icon: "user",
    });
    expect(status).toBe(201);
    const data = (body as { data: NodeTypeData }).data;
    expect(data.name).toBe("Person");
    expect(data.slug).toBe("person");
    expect(data.color).toBe("#FF0000");
    expect(data.icon).toBe("user");
    expect(data.display_field_slug).toBeNull();
    expect(data.graph_id).toBe(graphId);
    expect(data.id).toBeTruthy();
    expect(data.created_at).toBeTruthy();
    expect(data.updated_at).toBeTruthy();
  });

  it("POST rejects empty name (400)", async () => {
    const { status, body } = await createNodeType(graphId, {});
    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("name");
  });

  it("POST rejects blank name (400)", async () => {
    const { status, body } = await createNodeType(graphId, { name: "   " });
    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("name");
  });

  it("POST rejects duplicate name within same graph (409)", async () => {
    // Create a node type first
    const { status: firstStatus } = await createNodeType(graphId, {
      name: "DupTest",
    });
    expect(firstStatus).toBe(201);

    // Try to create another with the same name
    const { status, body } = await createNodeType(graphId, {
      name: "DupTest",
    });
    expect(status).toBe(409);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("already exists");
  });

  it("POST auto-deduplicates slugs", async () => {
    // Create "Company" — slug should be "company"
    const { body: first } = await createNodeType(graphId, { name: "Company" });
    const firstData = (first as { data: NodeTypeData }).data;
    expect(firstData.slug).toBe("company");

    // Delete it
    await deleteNodeType(graphId, firstData.id);

    // Create "Company" again — name is unique now, but slug "company" still exists? No, delete removes it.
    // Instead test slug dedup by creating items with names that produce same slug
    // Create "My Item" — slug "my_item"
    const { body: a } = await createNodeType(graphId, { name: "My Item" });
    const aData = (a as { data: NodeTypeData }).data;
    expect(aData.slug).toBe("my_item");

    // Create "My-Item" — would also produce slug "my_item", should be deduplicated
    // But name is different so name uniqueness passes
    const { body: b } = await createNodeType(graphId, { name: "My-Item" });
    const bData = (b as { data: NodeTypeData }).data;
    expect(bData.slug).toBe("my_item_2");
  });

  it("GET lists all node types for graph (200)", async () => {
    // Create a node type to ensure there's at least one
    await createNodeType(graphId, { name: "ListTestType" });

    const { status, body } = await listNodeTypes(graphId);
    expect(status).toBe(200);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    const names = body.data.map((nt) => nt.name);
    expect(names).toContain("ListTestType");
  });

  it("GET single node type by ID (200)", async () => {
    // Create a fresh node type to get its ID
    const { body: created } = await createNodeType(graphId, {
      name: "Organization",
    });
    const id = (created as { data: NodeTypeData }).data.id;

    const { status, body } = await getNodeType(graphId, id);
    expect(status).toBe(200);
    const data = (body as { data: NodeTypeData }).data;
    expect(data.id).toBe(id);
    expect(data.name).toBe("Organization");
    expect(data.slug).toBe("organization");
  });

  it("GET returns 404 for non-existent node type", async () => {
    const { status, body } = await getNodeType(graphId, "nonexistent-id");
    expect(status).toBe(404);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("not found");
  });

  it("GET returns 404 for node type in different graph", async () => {
    // Create a node type in a different graph
    const otherGraphId = await createGraph("Other Graph for NT");
    const { body: created } = await createNodeType(otherGraphId, {
      name: "OtherType",
    });
    const otherNtId = (created as { data: NodeTypeData }).data.id;

    // Try to get it via the original graph — should 404
    const { status } = await getNodeType(graphId, otherNtId);
    expect(status).toBe(404);
  });

  it("PATCH updates name, color, icon (200)", async () => {
    const { body: created } = await createNodeType(graphId, {
      name: "Event",
      color: "#000",
    });
    const id = (created as { data: NodeTypeData }).data.id;

    const { status, body } = await updateNodeType(graphId, id, {
      name: "Meeting",
      color: "#00FF00",
      icon: "calendar",
    });
    expect(status).toBe(200);
    const data = (body as { data: NodeTypeData }).data;
    expect(data.name).toBe("Meeting");
    expect(data.color).toBe("#00FF00");
    expect(data.icon).toBe("calendar");
    // Slug should NOT change
    expect(data.slug).toBe("event");
    expect(data.updated_at).not.toBe(data.created_at);
  });

  it("PATCH rejects duplicate name (409)", async () => {
    // Create two node types
    await createNodeType(graphId, { name: "PatchDupA" });
    const { body: created } = await createNodeType(graphId, {
      name: "PatchDupB",
    });
    const id = (created as { data: NodeTypeData }).data.id;

    // Try to rename PatchDupB to PatchDupA
    const { status, body } = await updateNodeType(graphId, id, {
      name: "PatchDupA",
    });
    expect(status).toBe(409);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("already exists");
  });

  it("PATCH validates display_field_slug references existing field (400)", async () => {
    const { body: created } = await createNodeType(graphId, {
      name: "Location",
    });
    const id = (created as { data: NodeTypeData }).data.id;

    const { status, body } = await updateNodeType(graphId, id, {
      display_field_slug: "nonexistent_field",
    });
    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("nonexistent_field");
  });

  it("PATCH can set display_field_slug to a valid field and back to null (200)", async () => {
    const { body: created } = await createNodeType(graphId, {
      name: "Project",
    });
    const ntId = (created as { data: NodeTypeData }).data.id;

    // Insert a field directly into DB
    const now = new Date().toISOString();
    await env.DB.prepare(
      "INSERT INTO node_type_fields (id, node_type_id, name, slug, field_type, ordinal, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind("field-proj-1", ntId, "Title", "title", "text", 0, now, now)
      .run();

    // Set display_field_slug to a valid field
    const { status, body } = await updateNodeType(graphId, ntId, {
      display_field_slug: "title",
    });
    expect(status).toBe(200);
    const data = (body as { data: NodeTypeData }).data;
    expect(data.display_field_slug).toBe("title");

    // Set it back to null
    const { status: status2, body: body2 } = await updateNodeType(
      graphId,
      ntId,
      { display_field_slug: null },
    );
    expect(status2).toBe(200);
    const data2 = (body2 as { data: NodeTypeData }).data;
    expect(data2.display_field_slug).toBeNull();
  });

  it("DELETE removes node type (204)", async () => {
    const { body: created } = await createNodeType(graphId, {
      name: "Deletable",
    });
    const id = (created as { data: NodeTypeData }).data.id;

    const res = await deleteNodeType(graphId, id);
    expect(res.status).toBe(204);

    // Verify it's gone
    const { status } = await getNodeType(graphId, id);
    expect(status).toBe(404);
  });

  it("DELETE returns 404 for non-existent node type", async () => {
    const res = await deleteNodeType(graphId, "nonexistent-nt-id");
    expect(res.status).toBe(404);
  });

  it("DELETE cascades to nodes and edges connected to those nodes", async () => {
    // Create a fresh graph for isolation
    const cascadeGraphId = await createGraph("Cascade NT Test");

    const now = new Date().toISOString();

    // Create two node types
    const { body: ntBody1 } = await createNodeType(cascadeGraphId, {
      name: "Author",
    });
    const ntId1 = (ntBody1 as { data: NodeTypeData }).data.id;

    const { body: ntBody2 } = await createNodeType(cascadeGraphId, {
      name: "Book",
    });
    const ntId2 = (ntBody2 as { data: NodeTypeData }).data.id;

    // Insert nodes, edge type, and edge directly into DB
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO nodes (id, graph_id, node_type_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind("node-nt-casc-1", cascadeGraphId, ntId1, "{}", now, now),
      env.DB.prepare(
        "INSERT INTO nodes (id, graph_id, node_type_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind("node-nt-casc-2", cascadeGraphId, ntId2, "{}", now, now),
      env.DB.prepare(
        "INSERT INTO edge_types (id, graph_id, name, slug, directed, source_node_type_id, target_node_type_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(
        "et-nt-casc-1",
        cascadeGraphId,
        "wrote",
        "wrote",
        1,
        ntId1,
        ntId2,
        now,
        now,
      ),
      env.DB.prepare(
        "INSERT INTO edges (id, graph_id, edge_type_id, source_node_id, target_node_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(
        "edge-nt-casc-1",
        cascadeGraphId,
        "et-nt-casc-1",
        "node-nt-casc-1",
        "node-nt-casc-2",
        "{}",
        now,
        now,
      ),
    ]);

    // Verify the data exists
    const nodesBefore = await env.DB.prepare(
      "SELECT id FROM nodes WHERE graph_id = ?",
    )
      .bind(cascadeGraphId)
      .all();
    expect(nodesBefore.results.length).toBe(2);

    const edgesBefore = await env.DB.prepare(
      "SELECT id FROM edges WHERE graph_id = ?",
    )
      .bind(cascadeGraphId)
      .all();
    expect(edgesBefore.results.length).toBe(1);

    // Delete the first node type (Author) — should cascade to its node and the edge
    const res = await deleteNodeType(cascadeGraphId, ntId1);
    expect(res.status).toBe(204);

    // The node belonging to Author should be gone
    const authorNodes = await env.DB.prepare(
      "SELECT id FROM nodes WHERE node_type_id = ?",
    )
      .bind(ntId1)
      .all();
    expect(authorNodes.results.length).toBe(0);

    // The edge should be gone because its source node was deleted (ON DELETE CASCADE)
    const edgesAfter = await env.DB.prepare(
      "SELECT id FROM edges WHERE graph_id = ?",
    )
      .bind(cascadeGraphId)
      .all();
    expect(edgesAfter.results.length).toBe(0);

    // Book node type and its node should still exist
    const bookNodes = await env.DB.prepare(
      "SELECT id FROM nodes WHERE node_type_id = ?",
    )
      .bind(ntId2)
      .all();
    expect(bookNodes.results.length).toBe(1);
  });
});

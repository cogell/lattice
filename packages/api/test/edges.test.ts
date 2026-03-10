import { env, SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import "../src/index";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

type ErrorBody = { error: { status: number; message: string } };

// ---------------------------------------------------------------------------
// Unique-ID counter (avoids collisions across tests)
// ---------------------------------------------------------------------------

let counter = 0;
function uid(prefix: string) {
  counter += 1;
  return `${prefix}-${counter.toString().padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------
// DB insert helpers (fast setup, no HTTP round-trips)
// ---------------------------------------------------------------------------

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
    "INSERT INTO edge_types (id, graph_id, name, slug, directed, source_node_type_id, target_node_type_id, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)",
  )
    .bind(id, graphId, name, slug, sourceNodeTypeId, targetNodeTypeId, now, now)
    .run();
}

async function insertNode(
  graphId: string,
  id: string,
  nodeTypeId: string,
  data: string = "{}",
) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO nodes (id, graph_id, node_type_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, graphId, nodeTypeId, data, now, now)
    .run();
}

async function insertEdgeTypeField(
  edgeTypeId: string,
  id: string,
  slug: string,
  name: string,
  fieldType: string,
  required: number,
  config: string = "{}",
) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO edge_type_fields (id, edge_type_id, name, slug, field_type, ordinal, required, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)",
  )
    .bind(id, edgeTypeId, name, slug, fieldType, required, config, now, now)
    .run();
}

// ---------------------------------------------------------------------------
// API call helpers
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

async function createEdge(graphId: string, body: object) {
  const res = await SELF.fetch(
    `http://localhost/api/v1/graphs/${graphId}/edges`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return {
    status: res.status,
    body: await res.json<{ data: EdgeData } | ErrorBody>(),
  };
}

type PaginationMeta = { total: number; limit: number; offset: number; has_more: boolean };

async function listEdges(graphId: string, params?: string) {
  const url = params
    ? `http://localhost/api/v1/graphs/${graphId}/edges?${params}`
    : `http://localhost/api/v1/graphs/${graphId}/edges`;
  const res = await SELF.fetch(url);
  return {
    status: res.status,
    body: await res.json<{ data: EdgeData[]; pagination: PaginationMeta }>(),
  };
}

async function getEdge(graphId: string, edgeId: string) {
  const res = await SELF.fetch(
    `http://localhost/api/v1/graphs/${graphId}/edges/${edgeId}`,
  );
  return {
    status: res.status,
    body: await res.json<{ data: EdgeData } | ErrorBody>(),
  };
}

async function updateEdge(graphId: string, edgeId: string, body: object) {
  const res = await SELF.fetch(
    `http://localhost/api/v1/graphs/${graphId}/edges/${edgeId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return {
    status: res.status,
    body: await res.json<{ data: EdgeData } | ErrorBody>(),
  };
}

async function deleteEdge(graphId: string, edgeId: string) {
  return SELF.fetch(
    `http://localhost/api/v1/graphs/${graphId}/edges/${edgeId}`,
    { method: "DELETE" },
  );
}

// ---------------------------------------------------------------------------
// Standard setup: graph + 2 node types + 1 edge type + 2 nodes
// ---------------------------------------------------------------------------

async function setupGraphWithNodes() {
  const graphId = await createGraph(`Edge Test ${uid("graph")}`);
  const personTypeId = uid("nt-person");
  const orgTypeId = uid("nt-org");
  const edgeTypeId = uid("et-works-at");
  const personNodeId = uid("node-person");
  const orgNodeId = uid("node-org");

  await insertNodeType(graphId, personTypeId, "Person", "person");
  await insertNodeType(graphId, orgTypeId, "Org", "org");
  await insertEdgeType(
    graphId,
    edgeTypeId,
    "works_at",
    "works_at",
    personTypeId,
    orgTypeId,
  );
  await insertNode(graphId, personNodeId, personTypeId);
  await insertNode(graphId, orgNodeId, orgTypeId);

  return { graphId, personTypeId, orgTypeId, edgeTypeId, personNodeId, orgNodeId };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Edge CRUD", () => {
  // ===================== CREATE =====================

  it("POST creates edge with valid data (201)", async () => {
    const { graphId, edgeTypeId, personNodeId, orgNodeId } =
      await setupGraphWithNodes();

    const { status, body } = await createEdge(graphId, {
      edge_type_id: edgeTypeId,
      source_node_id: personNodeId,
      target_node_id: orgNodeId,
    });

    expect(status).toBe(201);
    const data = (body as { data: EdgeData }).data;
    expect(data.id).toBeTruthy();
    expect(data.graph_id).toBe(graphId);
    expect(data.edge_type_id).toBe(edgeTypeId);
    expect(data.source_node_id).toBe(personNodeId);
    expect(data.target_node_id).toBe(orgNodeId);
    expect(data.data).toEqual({});
    expect(data.created_at).toBeTruthy();
    expect(data.updated_at).toBeTruthy();
  });

  it("POST creates edge with empty data when no fields on edge type (201)", async () => {
    const { graphId, edgeTypeId, personNodeId, orgNodeId } =
      await setupGraphWithNodes();

    const { status, body } = await createEdge(graphId, {
      edge_type_id: edgeTypeId,
      source_node_id: personNodeId,
      target_node_id: orgNodeId,
      data: {},
    });

    expect(status).toBe(201);
    const data = (body as { data: EdgeData }).data;
    expect(data.data).toEqual({});
  });

  it("POST rejects missing edge_type_id (400)", async () => {
    const { graphId, personNodeId, orgNodeId } = await setupGraphWithNodes();

    const { status, body } = await createEdge(graphId, {
      source_node_id: personNodeId,
      target_node_id: orgNodeId,
    });

    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("edge_type_id");
  });

  it("POST rejects missing source_node_id (400)", async () => {
    const { graphId, edgeTypeId, orgNodeId } = await setupGraphWithNodes();

    const { status, body } = await createEdge(graphId, {
      edge_type_id: edgeTypeId,
      target_node_id: orgNodeId,
    });

    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("source_node_id");
  });

  it("POST rejects missing target_node_id (400)", async () => {
    const { graphId, edgeTypeId, personNodeId } = await setupGraphWithNodes();

    const { status, body } = await createEdge(graphId, {
      edge_type_id: edgeTypeId,
      source_node_id: personNodeId,
    });

    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("target_node_id");
  });

  it("POST rejects self-referencing edge (400)", async () => {
    const { graphId, edgeTypeId, personNodeId } = await setupGraphWithNodes();

    const { status, body } = await createEdge(graphId, {
      edge_type_id: edgeTypeId,
      source_node_id: personNodeId,
      target_node_id: personNodeId,
    });

    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("Self-referencing");
  });

  it("POST rejects edge_type_id from a different graph (400)", async () => {
    const setup1 = await setupGraphWithNodes();
    const setup2 = await setupGraphWithNodes();

    // Use edge type from graph 2, but nodes from graph 1
    const { status, body } = await createEdge(setup1.graphId, {
      edge_type_id: setup2.edgeTypeId,
      source_node_id: setup1.personNodeId,
      target_node_id: setup1.orgNodeId,
    });

    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("Edge type not found");
  });

  it("POST rejects non-existent source node (400)", async () => {
    const { graphId, edgeTypeId, orgNodeId } = await setupGraphWithNodes();

    const { status, body } = await createEdge(graphId, {
      edge_type_id: edgeTypeId,
      source_node_id: "nonexistent-source-node",
      target_node_id: orgNodeId,
    });

    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("Source node not found");
  });

  it("POST rejects non-existent target node (400)", async () => {
    const { graphId, edgeTypeId, personNodeId } = await setupGraphWithNodes();

    const { status, body } = await createEdge(graphId, {
      edge_type_id: edgeTypeId,
      source_node_id: personNodeId,
      target_node_id: "nonexistent-target-node",
    });

    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("Target node not found");
  });

  it("POST rejects source node with wrong type (400)", async () => {
    // Edge type expects source=Person, target=Org.
    // Swap: use orgNode as source (Org type, but edge expects Person).
    const { graphId, edgeTypeId, personNodeId, orgNodeId } =
      await setupGraphWithNodes();

    const { status, body } = await createEdge(graphId, {
      edge_type_id: edgeTypeId,
      source_node_id: orgNodeId, // Org, but edge expects Person
      target_node_id: personNodeId, // Person, but edge expects Org
    });

    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("Source node type does not match");
  });

  it("POST rejects target node with wrong type (400)", async () => {
    // Create a second Person node so source type matches, but use it as target too
    const { graphId, personTypeId, edgeTypeId, personNodeId } =
      await setupGraphWithNodes();

    const secondPersonId = uid("node-person2");
    await insertNode(graphId, secondPersonId, personTypeId);

    const { status, body } = await createEdge(graphId, {
      edge_type_id: edgeTypeId,
      source_node_id: personNodeId, // Person (correct for source)
      target_node_id: secondPersonId, // Person, but edge expects Org
    });

    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("Target node type does not match");
  });

  // ===================== LIST =====================

  it("GET lists all edges in graph", async () => {
    const { graphId, edgeTypeId, personTypeId, orgTypeId } =
      await setupGraphWithNodes();

    // Create two separate person-org pairs and edges
    const p1 = uid("node-list-p1");
    const o1 = uid("node-list-o1");
    const p2 = uid("node-list-p2");
    const o2 = uid("node-list-o2");
    await insertNode(graphId, p1, personTypeId);
    await insertNode(graphId, o1, orgTypeId);
    await insertNode(graphId, p2, personTypeId);
    await insertNode(graphId, o2, orgTypeId);

    await createEdge(graphId, {
      edge_type_id: edgeTypeId,
      source_node_id: p1,
      target_node_id: o1,
    });
    await createEdge(graphId, {
      edge_type_id: edgeTypeId,
      source_node_id: p2,
      target_node_id: o2,
    });

    const { status, body } = await listEdges(graphId);
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(2);
  });

  it("GET with ?type= filters by edge_type_id", async () => {
    const { graphId, personTypeId, orgTypeId, edgeTypeId, personNodeId, orgNodeId } =
      await setupGraphWithNodes();

    // Create a second edge type
    const et2 = uid("et-reports");
    await insertEdgeType(graphId, et2, "reports_to", "reports_to", personTypeId, orgTypeId);

    // Create an edge of each type
    await createEdge(graphId, {
      edge_type_id: edgeTypeId,
      source_node_id: personNodeId,
      target_node_id: orgNodeId,
    });

    const p2 = uid("node-filt-p");
    const o2 = uid("node-filt-o");
    await insertNode(graphId, p2, personTypeId);
    await insertNode(graphId, o2, orgTypeId);
    await createEdge(graphId, {
      edge_type_id: et2,
      source_node_id: p2,
      target_node_id: o2,
    });

    // Filter by first edge type
    const { status, body } = await listEdges(graphId, `type=${edgeTypeId}`);
    expect(status).toBe(200);
    expect(body.data.length).toBe(1);
    expect(body.data[0].edge_type_id).toBe(edgeTypeId);

    // Filter by second edge type
    const { body: body2 } = await listEdges(graphId, `type=${et2}`);
    expect(body2.data.length).toBe(1);
    expect(body2.data[0].edge_type_id).toBe(et2);
  });

  it("GET returns empty array when no edges", async () => {
    const { graphId } = await setupGraphWithNodes();

    const { status, body } = await listEdges(graphId);
    expect(status).toBe(200);
    expect(body.data).toEqual([]);
  });

  // ===================== GET SINGLE =====================

  it("GET /:edgeId returns edge with parsed data", async () => {
    const { graphId, edgeTypeId, personNodeId, orgNodeId } =
      await setupGraphWithNodes();

    const { body: created } = await createEdge(graphId, {
      edge_type_id: edgeTypeId,
      source_node_id: personNodeId,
      target_node_id: orgNodeId,
    });
    const edgeId = (created as { data: EdgeData }).data.id;

    const { status, body } = await getEdge(graphId, edgeId);
    expect(status).toBe(200);
    const data = (body as { data: EdgeData }).data;
    expect(data.id).toBe(edgeId);
    expect(data.graph_id).toBe(graphId);
    expect(data.edge_type_id).toBe(edgeTypeId);
    expect(data.source_node_id).toBe(personNodeId);
    expect(data.target_node_id).toBe(orgNodeId);
    expect(typeof data.data).toBe("object");
  });

  it("GET /:edgeId returns 404 for non-existent edge", async () => {
    const { graphId } = await setupGraphWithNodes();

    const { status, body } = await getEdge(graphId, "nonexistent-edge-id");
    expect(status).toBe(404);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("not found");
  });

  // ===================== UPDATE =====================

  it("PATCH updates data fields and merges with existing", async () => {
    const { graphId, edgeTypeId, personNodeId, orgNodeId } =
      await setupGraphWithNodes();

    // Add fields to the edge type so data can hold values
    const fieldId1 = uid("etf-label");
    const fieldId2 = uid("etf-notes");
    await insertEdgeTypeField(edgeTypeId, fieldId1, "label", "Label", "text", 0);
    await insertEdgeTypeField(edgeTypeId, fieldId2, "notes", "Notes", "text", 0);

    // Create edge with initial data
    const { body: created } = await createEdge(graphId, {
      edge_type_id: edgeTypeId,
      source_node_id: personNodeId,
      target_node_id: orgNodeId,
      data: { label: "engineer" },
    });
    const edgeId = (created as { data: EdgeData }).data.id;

    // Update with new field — should merge
    const { status, body } = await updateEdge(graphId, edgeId, {
      data: { notes: "senior role" },
    });
    expect(status).toBe(200);
    const data = (body as { data: EdgeData }).data;
    expect(data.data.label).toBe("engineer"); // preserved
    expect(data.data.notes).toBe("senior role"); // added
    expect(data.updated_at).not.toBe(data.created_at);
  });

  it("PATCH returns 404 for non-existent edge", async () => {
    const { graphId } = await setupGraphWithNodes();

    const { status, body } = await updateEdge(graphId, "nonexistent-edge-id", {
      data: { foo: "bar" },
    });
    expect(status).toBe(404);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("not found");
  });

  // ===================== DELETE =====================

  it("DELETE returns 204 and removes edge", async () => {
    const { graphId, edgeTypeId, personNodeId, orgNodeId } =
      await setupGraphWithNodes();

    const { body: created } = await createEdge(graphId, {
      edge_type_id: edgeTypeId,
      source_node_id: personNodeId,
      target_node_id: orgNodeId,
    });
    const edgeId = (created as { data: EdgeData }).data.id;

    const res = await deleteEdge(graphId, edgeId);
    expect(res.status).toBe(204);

    // Confirm it's gone
    const { status } = await getEdge(graphId, edgeId);
    expect(status).toBe(404);
  });

  it("DELETE returns 404 for non-existent edge", async () => {
    const { graphId } = await setupGraphWithNodes();

    const res = await deleteEdge(graphId, "nonexistent-edge-id");
    expect(res.status).toBe(404);
  });

  // ===================== DATA VALIDATION =====================

  it("POST rejects unknown fields on edge data", async () => {
    const { graphId, edgeTypeId, personNodeId, orgNodeId } =
      await setupGraphWithNodes();

    // Edge type has no fields defined, so any data key is unknown
    const { status, body } = await createEdge(graphId, {
      edge_type_id: edgeTypeId,
      source_node_id: personNodeId,
      target_node_id: orgNodeId,
      data: { unknown_field: "value" },
    });

    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("Unknown field");
  });

  it("POST rejects missing required edge field", async () => {
    const { graphId, edgeTypeId, personNodeId, orgNodeId } =
      await setupGraphWithNodes();

    // Add a required field to the edge type
    const fieldId = uid("etf-weight-req");
    await insertEdgeTypeField(edgeTypeId, fieldId, "weight", "Weight", "number", 1);

    // Try to create edge without the required field
    const { status, body } = await createEdge(graphId, {
      edge_type_id: edgeTypeId,
      source_node_id: personNodeId,
      target_node_id: orgNodeId,
      data: {},
    });

    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("required");
  });

  it("POST rejects wrong type for edge field", async () => {
    const { graphId, edgeTypeId, personNodeId, orgNodeId } =
      await setupGraphWithNodes();

    // Add a number field
    const fieldId = uid("etf-weight-type");
    await insertEdgeTypeField(edgeTypeId, fieldId, "weight", "Weight", "number", 0);

    // Supply a string instead of a number
    const { status, body } = await createEdge(graphId, {
      edge_type_id: edgeTypeId,
      source_node_id: personNodeId,
      target_node_id: orgNodeId,
      data: { weight: "not-a-number" },
    });

    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("expected number");
  });

  it("PATCH validates edge data fields on update", async () => {
    const { graphId, edgeTypeId, personNodeId, orgNodeId } =
      await setupGraphWithNodes();

    // Add a number field
    const fieldId = uid("etf-score-upd");
    await insertEdgeTypeField(edgeTypeId, fieldId, "score", "Score", "number", 0);

    // Create edge with valid data
    const { body: created } = await createEdge(graphId, {
      edge_type_id: edgeTypeId,
      source_node_id: personNodeId,
      target_node_id: orgNodeId,
      data: { score: 10 },
    });
    const edgeId = (created as { data: EdgeData }).data.id;

    // Update with wrong type
    const { status, body } = await updateEdge(graphId, edgeId, {
      data: { score: "bad" },
    });

    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("expected number");
  });
});

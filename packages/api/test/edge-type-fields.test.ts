import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import "../src/index";

type FieldData = {
  id: string;
  edge_type_id: string;
  name: string;
  slug: string;
  field_type: string;
  ordinal: number;
  required: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type ErrorBody = { error: { status: number; message: string } };

// Shared state for the test suite
let graphId: string;
let sourceNodeTypeId: string;
let targetNodeTypeId: string;
let edgeTypeId: string;

// Helper: create a graph
async function createGraph(name: string) {
  const res = await SELF.fetch("http://localhost/api/v1/graphs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const body = await res.json<{ data: { id: string } }>();
  return body.data.id;
}

// Helper: insert node type directly
async function insertNodeType(id: string, graphId: string, name: string, slug: string) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO node_types (id, graph_id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, graphId, name, slug, now, now)
    .run();
}

// Helper: create edge type via API
async function createEdgeType(
  gId: string,
  data: { name: string; source_node_type_id: string; target_node_type_id: string },
) {
  const res = await SELF.fetch(`http://localhost/api/v1/graphs/${gId}/edge-types`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = await res.json<{ data: { id: string } }>();
  return body.data.id;
}

// Helper: create field
async function createField(
  gId: string,
  etId: string,
  data: Record<string, unknown>,
) {
  const res = await SELF.fetch(
    `http://localhost/api/v1/graphs/${gId}/edge-types/${etId}/fields`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
  );
  return {
    status: res.status,
    body: await res.json<{ data: FieldData } | ErrorBody>(),
  };
}

// Helper: update field
async function updateField(
  gId: string,
  etId: string,
  fieldId: string,
  data: Record<string, unknown>,
) {
  const res = await SELF.fetch(
    `http://localhost/api/v1/graphs/${gId}/edge-types/${etId}/fields/${fieldId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
  );
  return {
    status: res.status,
    body: await res.json<{ data: FieldData } | ErrorBody>(),
  };
}

// Helper: delete field
async function deleteField(gId: string, etId: string, fieldId: string) {
  return SELF.fetch(
    `http://localhost/api/v1/graphs/${gId}/edge-types/${etId}/fields/${fieldId}`,
    {
      method: "DELETE",
    },
  );
}

// Recreate the base fixture for each test so suites stay isolated.
beforeEach(async () => {
  graphId = await createGraph("ETF Test Graph");
  sourceNodeTypeId = "nt-etf-source";
  targetNodeTypeId = "nt-etf-target";
  await insertNodeType(sourceNodeTypeId, graphId, "Person", "person");
  await insertNodeType(targetNodeTypeId, graphId, "Company", "company");
  edgeTypeId = await createEdgeType(graphId, {
    name: "works_at",
    source_node_type_id: sourceNodeTypeId,
    target_node_type_id: targetNodeTypeId,
  });
});

describe("Edge Type Fields CRUD", () => {
  it("POST creates field with auto-generated slug (201)", async () => {
    const { status, body } = await createField(graphId, edgeTypeId, {
      name: "Weight",
      field_type: "number",
      ordinal: 0,
    });
    expect(status).toBe(201);
    const data = (body as { data: FieldData }).data;
    expect(data.name).toBe("Weight");
    expect(data.slug).toBe("weight");
    expect(data.field_type).toBe("number");
    expect(data.ordinal).toBe(0);
    expect(data.required).toBe(false);
    expect(data.edge_type_id).toBe(edgeTypeId);
    expect(data.id).toBeTruthy();
    expect(data.created_at).toBeTruthy();
    expect(data.updated_at).toBeTruthy();
  });

  it("POST rejects empty name (400)", async () => {
    const { status, body } = await createField(graphId, edgeTypeId, {
      name: "   ",
      field_type: "text",
      ordinal: 1,
    });
    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("name");
  });

  it("POST rejects invalid field_type (400)", async () => {
    const { status, body } = await createField(graphId, edgeTypeId, {
      name: "Bad Type",
      field_type: "invalid_type",
      ordinal: 1,
    });
    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("field_type");
  });

  it("POST rejects duplicate field name within edge type (409)", async () => {
    // Create the field first
    const first = await createField(graphId, edgeTypeId, {
      name: "Unique Field",
      field_type: "text",
      ordinal: 0,
    });
    expect(first.status).toBe(201);

    // Try to create a field with the same name
    const { status, body } = await createField(graphId, edgeTypeId, {
      name: "Unique Field",
      field_type: "number",
      ordinal: 2,
    });
    expect(status).toBe(409);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("already exists");
  });

  it("POST creates field with select config options (201)", async () => {
    const { status, body } = await createField(graphId, edgeTypeId, {
      name: "Relationship",
      field_type: "select",
      ordinal: 1,
      config: { options: ["full-time", "part-time", "contract"] },
    });
    expect(status).toBe(201);
    const data = (body as { data: FieldData }).data;
    expect(data.field_type).toBe("select");
    expect(data.config).toEqual({ options: ["full-time", "part-time", "contract"] });
  });

  it("POST rejects select field_type without options (400)", async () => {
    const { status, body } = await createField(graphId, edgeTypeId, {
      name: "Bad Select",
      field_type: "select",
      ordinal: 2,
    });
    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("options");
  });

  it("PATCH updates field name and ordinal (200)", async () => {
    // Create a field to update
    const { body: created } = await createField(graphId, edgeTypeId, {
      name: "Start Date",
      field_type: "date",
      ordinal: 3,
    });
    const fieldId = (created as { data: FieldData }).data.id;

    const { status, body } = await updateField(graphId, edgeTypeId, fieldId, {
      name: "Employment Start",
      ordinal: 10,
    });
    expect(status).toBe(200);
    const data = (body as { data: FieldData }).data;
    expect(data.name).toBe("Employment Start");
    expect(data.ordinal).toBe(10);
    // slug should remain unchanged (immutable)
    expect(data.slug).toBe("start_date");
  });

  it("PATCH rejects field_type change (400)", async () => {
    const { body: created } = await createField(graphId, edgeTypeId, {
      name: "Notes",
      field_type: "text",
      ordinal: 4,
    });
    const fieldId = (created as { data: FieldData }).data.id;

    const { status, body } = await updateField(graphId, edgeTypeId, fieldId, {
      field_type: "number",
    });
    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toBe("Field type is immutable");
  });

  it("PATCH rejects setting required:true when edges exist (400)", async () => {
    // Create a separate edge type for this test
    const etId = await createEdgeType(graphId, {
      name: "manages",
      source_node_type_id: sourceNodeTypeId,
      target_node_type_id: targetNodeTypeId,
    });

    // Create a field on this edge type
    const { body: created } = await createField(graphId, etId, {
      name: "Level",
      field_type: "number",
      ordinal: 0,
    });
    const fieldId = (created as { data: FieldData }).data.id;

    // Insert nodes and an edge of this type
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO nodes (id, graph_id, node_type_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind("node-etf-src-1", graphId, sourceNodeTypeId, "{}", now, now),
      env.DB.prepare(
        "INSERT INTO nodes (id, graph_id, node_type_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind("node-etf-tgt-1", graphId, targetNodeTypeId, "{}", now, now),
      env.DB.prepare(
        "INSERT INTO edges (id, graph_id, edge_type_id, source_node_id, target_node_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind("edge-etf-1", graphId, etId, "node-etf-src-1", "node-etf-tgt-1", "{}", now, now),
    ]);

    const { status, body } = await updateField(graphId, etId, fieldId, {
      required: true,
    });
    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toBe("Cannot make field required when edges of this type exist");
  });

  it("PATCH allows setting required:true when NO edges exist (200)", async () => {
    // Create a separate edge type with no edges
    const etId = await createEdgeType(graphId, {
      name: "mentors",
      source_node_type_id: sourceNodeTypeId,
      target_node_type_id: targetNodeTypeId,
    });

    const { body: created } = await createField(graphId, etId, {
      name: "Frequency",
      field_type: "text",
      ordinal: 0,
    });
    const fieldId = (created as { data: FieldData }).data.id;

    const { status, body } = await updateField(graphId, etId, fieldId, {
      required: true,
    });
    expect(status).toBe(200);
    const data = (body as { data: FieldData }).data;
    expect(data.required).toBe(true);
  });

  it("PATCH rejects duplicate field name (409)", async () => {
    // Create a separate edge type
    const etId = await createEdgeType(graphId, {
      name: "collaborates",
      source_node_type_id: sourceNodeTypeId,
      target_node_type_id: targetNodeTypeId,
    });

    // Create two fields
    await createField(graphId, etId, { name: "Alpha", field_type: "text", ordinal: 0 });
    const { body: second } = await createField(graphId, etId, {
      name: "Beta",
      field_type: "text",
      ordinal: 1,
    });
    const betaId = (second as { data: FieldData }).data.id;

    // Try to rename Beta to Alpha
    const { status, body } = await updateField(graphId, etId, betaId, {
      name: "Alpha",
    });
    expect(status).toBe(409);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("already exists");
  });

  it("DELETE removes field (204)", async () => {
    // Create a separate edge type
    const etId = await createEdgeType(graphId, {
      name: "reports_to",
      source_node_type_id: sourceNodeTypeId,
      target_node_type_id: targetNodeTypeId,
    });

    const { body: created } = await createField(graphId, etId, {
      name: "Priority",
      field_type: "number",
      ordinal: 0,
    });
    const fieldId = (created as { data: FieldData }).data.id;

    const res = await deleteField(graphId, etId, fieldId);
    expect(res.status).toBe(204);

    // Verify it's gone from DB
    const row = await env.DB.prepare(
      "SELECT id FROM edge_type_fields WHERE id = ?",
    )
      .bind(fieldId)
      .first();
    expect(row).toBeNull();
  });

  it("DELETE prunes field slug from edge data JSON", async () => {
    // Create a separate edge type
    const etId = await createEdgeType(graphId, {
      name: "advised_by",
      source_node_type_id: sourceNodeTypeId,
      target_node_type_id: targetNodeTypeId,
    });

    // Create a field
    const { body: created } = await createField(graphId, etId, {
      name: "Advice Type",
      field_type: "text",
      ordinal: 0,
    });
    const field = (created as { data: FieldData }).data;

    // Insert nodes and an edge with data containing the field slug
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO nodes (id, graph_id, node_type_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind("node-prune-src", graphId, sourceNodeTypeId, "{}", now, now),
      env.DB.prepare(
        "INSERT INTO nodes (id, graph_id, node_type_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind("node-prune-tgt", graphId, targetNodeTypeId, "{}", now, now),
      env.DB.prepare(
        "INSERT INTO edges (id, graph_id, edge_type_id, source_node_id, target_node_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(
        "edge-prune-1",
        graphId,
        etId,
        "node-prune-src",
        "node-prune-tgt",
        JSON.stringify({ [field.slug]: "career", other_key: "keep_me" }),
        now,
        now,
      ),
    ]);

    // Delete the field
    const res = await deleteField(graphId, etId, field.id);
    expect(res.status).toBe(204);

    // Verify edge data no longer has the field slug but keeps other keys
    const edge = await env.DB.prepare("SELECT data FROM edges WHERE id = ?")
      .bind("edge-prune-1")
      .first<{ data: string }>();

    expect(edge).not.toBeNull();
    const data = JSON.parse(edge!.data);
    expect(data).not.toHaveProperty(field.slug);
    expect(data.other_key).toBe("keep_me");
  });

  it("POST returns 404 for non-existent edge type", async () => {
    const { status, body } = await createField(graphId, "nonexistent-et-id", {
      name: "Test",
      field_type: "text",
      ordinal: 0,
    });
    expect(status).toBe(404);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("Edge type not found");
  });
});

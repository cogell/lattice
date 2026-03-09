import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import "../src/index";

type GraphData = {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

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

type FieldData = {
  id: string;
  node_type_id: string;
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

// Helper: create a graph
async function createGraph(name: string) {
  const res = await SELF.fetch("http://localhost/api/v1/graphs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const body = await res.json<{ data: GraphData }>();
  return body.data;
}

// Helper: create a node type
async function createNodeType(graphId: string, name: string) {
  const res = await SELF.fetch(
    `http://localhost/api/v1/graphs/${graphId}/node-types`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    },
  );
  const body = await res.json<{ data: NodeTypeData }>();
  return body.data;
}

// Helper: create a field
async function createField(
  graphId: string,
  nodeTypeId: string,
  data: Record<string, unknown>,
) {
  const res = await SELF.fetch(
    `http://localhost/api/v1/graphs/${graphId}/node-types/${nodeTypeId}/fields`,
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

// Helper: update a field
async function updateField(
  graphId: string,
  nodeTypeId: string,
  fieldId: string,
  data: Record<string, unknown>,
) {
  const res = await SELF.fetch(
    `http://localhost/api/v1/graphs/${graphId}/node-types/${nodeTypeId}/fields/${fieldId}`,
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

// Helper: delete a field
async function deleteField(
  graphId: string,
  nodeTypeId: string,
  fieldId: string,
) {
  return SELF.fetch(
    `http://localhost/api/v1/graphs/${graphId}/node-types/${nodeTypeId}/fields/${fieldId}`,
    { method: "DELETE" },
  );
}

describe("Node Type Field CRUD", () => {
  let graphId: string;
  let nodeTypeId: string;

  beforeEach(async () => {
    const graph = await createGraph("Field Test Graph");
    graphId = graph.id;
    const nodeType = await createNodeType(graphId, "Person");
    nodeTypeId = nodeType.id;
  });

  it("POST creates field with auto-generated slug (201)", async () => {
    const { status, body } = await createField(graphId, nodeTypeId, {
      name: "Full Name",
      field_type: "text",
      ordinal: 0,
    });

    expect(status).toBe(201);
    const data = (body as { data: FieldData }).data;
    expect(data.name).toBe("Full Name");
    expect(data.slug).toBe("full_name");
    expect(data.field_type).toBe("text");
    expect(data.ordinal).toBe(0);
    expect(data.required).toBe(false);
    expect(data.config).toEqual({});
    expect(data.node_type_id).toBe(nodeTypeId);
    expect(data.id).toBeTruthy();
    expect(data.created_at).toBeTruthy();
    expect(data.updated_at).toBeTruthy();
  });

  it("POST rejects empty name (400)", async () => {
    const { status, body } = await createField(graphId, nodeTypeId, {
      name: "   ",
      field_type: "text",
      ordinal: 0,
    });

    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("name");
  });

  it("POST rejects invalid field_type (400)", async () => {
    const { status, body } = await createField(graphId, nodeTypeId, {
      name: "Bad Field",
      field_type: "foobar",
      ordinal: 0,
    });

    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("field_type");
  });

  it("POST rejects duplicate field name within node type (409)", async () => {
    await createField(graphId, nodeTypeId, {
      name: "Email",
      field_type: "email",
      ordinal: 0,
    });

    const { status, body } = await createField(graphId, nodeTypeId, {
      name: "Email",
      field_type: "text",
      ordinal: 1,
    });

    expect(status).toBe(409);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("already exists");
  });

  it("POST creates field with select config options (201)", async () => {
    const { status, body } = await createField(graphId, nodeTypeId, {
      name: "Status",
      field_type: "select",
      ordinal: 0,
      config: { options: ["active", "inactive"] },
    });

    expect(status).toBe(201);
    const data = (body as { data: FieldData }).data;
    expect(data.field_type).toBe("select");
    expect(data.config).toEqual({ options: ["active", "inactive"] });
  });

  it("POST rejects select field_type without options (400)", async () => {
    const { status, body } = await createField(graphId, nodeTypeId, {
      name: "Status",
      field_type: "select",
      ordinal: 0,
    });

    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("options");
  });

  it("PATCH updates field name and ordinal (200)", async () => {
    const { body: createBody } = await createField(graphId, nodeTypeId, {
      name: "First Name",
      field_type: "text",
      ordinal: 0,
    });
    const fieldId = (createBody as { data: FieldData }).data.id;

    const { status, body } = await updateField(
      graphId,
      nodeTypeId,
      fieldId,
      { name: "Given Name", ordinal: 5 },
    );

    expect(status).toBe(200);
    const data = (body as { data: FieldData }).data;
    expect(data.name).toBe("Given Name");
    expect(data.ordinal).toBe(5);
    // slug should be unchanged (immutable)
    expect(data.slug).toBe("first_name");
  });

  it("PATCH rejects field_type change (400)", async () => {
    const { body: createBody } = await createField(graphId, nodeTypeId, {
      name: "Age",
      field_type: "number",
      ordinal: 0,
    });
    const fieldId = (createBody as { data: FieldData }).data.id;

    const { status, body } = await updateField(
      graphId,
      nodeTypeId,
      fieldId,
      { field_type: "text" },
    );

    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toBe("Field type is immutable");
  });

  it("PATCH rejects setting required:true when nodes exist (400)", async () => {
    const { body: createBody } = await createField(graphId, nodeTypeId, {
      name: "Bio",
      field_type: "text",
      ordinal: 0,
    });
    const fieldId = (createBody as { data: FieldData }).data.id;

    // Insert a node of this type directly into DB
    const now = new Date().toISOString();
    await env.DB.prepare(
      "INSERT INTO nodes (id, graph_id, node_type_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind("test-node-1", graphId, nodeTypeId, "{}", now, now)
      .run();

    const { status, body } = await updateField(
      graphId,
      nodeTypeId,
      fieldId,
      { required: true },
    );

    expect(status).toBe(400);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("Cannot make field required");
  });

  it("PATCH allows setting required:true when NO nodes exist (200)", async () => {
    const { body: createBody } = await createField(graphId, nodeTypeId, {
      name: "Nickname",
      field_type: "text",
      ordinal: 0,
    });
    const fieldId = (createBody as { data: FieldData }).data.id;

    const { status, body } = await updateField(
      graphId,
      nodeTypeId,
      fieldId,
      { required: true },
    );

    expect(status).toBe(200);
    const data = (body as { data: FieldData }).data;
    expect(data.required).toBe(true);
  });

  it("PATCH rejects duplicate field name (409)", async () => {
    await createField(graphId, nodeTypeId, {
      name: "Alpha",
      field_type: "text",
      ordinal: 0,
    });

    const { body: secondBody } = await createField(graphId, nodeTypeId, {
      name: "Beta",
      field_type: "text",
      ordinal: 1,
    });
    const betaId = (secondBody as { data: FieldData }).data.id;

    const { status, body } = await updateField(
      graphId,
      nodeTypeId,
      betaId,
      { name: "Alpha" },
    );

    expect(status).toBe(409);
    const err = body as ErrorBody;
    expect(err.error.message).toContain("already exists");
  });

  it("DELETE removes field (204)", async () => {
    const { body: createBody } = await createField(graphId, nodeTypeId, {
      name: "Temp Field",
      field_type: "text",
      ordinal: 0,
    });
    const fieldId = (createBody as { data: FieldData }).data.id;

    const res = await deleteField(graphId, nodeTypeId, fieldId);
    expect(res.status).toBe(204);

    // Verify field is gone from DB
    const row = await env.DB.prepare(
      "SELECT id FROM node_type_fields WHERE id = ?",
    )
      .bind(fieldId)
      .first();
    expect(row).toBeNull();
  });

  it("DELETE prunes field slug from node data JSON", async () => {
    const { body: createBody } = await createField(graphId, nodeTypeId, {
      name: "City",
      field_type: "text",
      ordinal: 0,
    });
    const field = (createBody as { data: FieldData }).data;

    // Insert a node with data containing the field slug
    const now = new Date().toISOString();
    const nodeData = JSON.stringify({ [field.slug]: "Seattle", other_key: "keep" });
    await env.DB.prepare(
      "INSERT INTO nodes (id, graph_id, node_type_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind("prune-test-node", graphId, nodeTypeId, nodeData, now, now)
      .run();

    // Delete the field
    const res = await deleteField(graphId, nodeTypeId, field.id);
    expect(res.status).toBe(204);

    // Verify node data no longer has the field slug
    const node = await env.DB.prepare(
      "SELECT data FROM nodes WHERE id = ?",
    )
      .bind("prune-test-node")
      .first<{ data: string }>();

    expect(node).toBeTruthy();
    const parsedData = JSON.parse(node!.data);
    expect(parsedData).not.toHaveProperty(field.slug);
    expect(parsedData.other_key).toBe("keep");
  });

  it("DELETE nullifies display_field_slug on parent node type when deleted field matches", async () => {
    const { body: createBody } = await createField(graphId, nodeTypeId, {
      name: "Title",
      field_type: "text",
      ordinal: 0,
    });
    const field = (createBody as { data: FieldData }).data;

    // Set the node type's display_field_slug to this field's slug
    await env.DB.prepare(
      "UPDATE node_types SET display_field_slug = ? WHERE id = ?",
    )
      .bind(field.slug, nodeTypeId)
      .run();

    // Verify it was set
    const before = await env.DB.prepare(
      "SELECT display_field_slug FROM node_types WHERE id = ?",
    )
      .bind(nodeTypeId)
      .first<{ display_field_slug: string | null }>();
    expect(before!.display_field_slug).toBe(field.slug);

    // Delete the field
    const res = await deleteField(graphId, nodeTypeId, field.id);
    expect(res.status).toBe(204);

    // Verify display_field_slug is now null
    const after = await env.DB.prepare(
      "SELECT display_field_slug FROM node_types WHERE id = ?",
    )
      .bind(nodeTypeId)
      .first<{ display_field_slug: string | null }>();
    expect(after!.display_field_slug).toBeNull();
  });
});

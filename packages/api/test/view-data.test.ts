import { env, SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";
import "../src/index";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEV_USER_ID = "01AAAAAAAAAAAAAAAAAAAADEV";
const OTHER_USER_ID = "01OTHER_USER_VIEW_DATA_00";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ViewDataResponse = {
  data: {
    nodes: Array<{
      id: string;
      graph_id: string;
      node_type_id: string;
      data: Record<string, unknown>;
      created_at: string;
      updated_at: string;
    }>;
    edges: Array<{
      id: string;
      graph_id: string;
      edge_type_id: string;
      source_node_id: string;
      target_node_id: string;
      data: Record<string, unknown>;
      created_at: string;
      updated_at: string;
    }>;
    node_types: Array<{
      id: string;
      graph_id: string;
      name: string;
      slug: string;
      color: string | null;
      icon: string | null;
      display_field_slug: string | null;
      created_at: string;
      updated_at: string;
      fields: Array<{
        id: string;
        name: string;
        slug: string;
        field_type: string;
        ordinal: number;
        required: boolean;
        config: Record<string, unknown>;
        created_at: string;
        updated_at: string;
      }>;
    }>;
    edge_types: Array<{
      id: string;
      graph_id: string;
      name: string;
      slug: string;
      directed: boolean;
      source_node_type_id: string;
      target_node_type_id: string;
      created_at: string;
      updated_at: string;
      fields: Array<{
        id: string;
        name: string;
        slug: string;
        field_type: string;
        ordinal: number;
        required: boolean;
        config: Record<string, unknown>;
        created_at: string;
        updated_at: string;
      }>;
    }>;
    truncated: boolean;
    counts: {
      nodes: number;
      edges: number;
      node_limit: number;
      edge_limit: number;
    };
  };
};

type ErrorBody = { error: { status: number; message: string } };

// ---------------------------------------------------------------------------
// DB insert helpers
// ---------------------------------------------------------------------------

const now = () => new Date().toISOString();

async function insertUser(id: string, email: string, name: string = "User") {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO users (id, email, name, email_verified) VALUES (?, ?, ?, 1)",
  )
    .bind(id, email, name)
    .run();
}

async function insertGraph(id: string, userId: string, name: string) {
  const ts = now();
  await env.DB.prepare(
    "INSERT INTO graphs (id, name, description, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, name, null, userId, ts, ts)
    .run();
}

async function insertNodeType(
  id: string,
  graphId: string,
  name: string,
  slug: string,
) {
  const ts = now();
  await env.DB.prepare(
    "INSERT INTO node_types (id, graph_id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, graphId, name, slug, ts, ts)
    .run();
}

async function insertEdgeType(
  id: string,
  graphId: string,
  name: string,
  slug: string,
  directed: number,
  sourceTypeId: string,
  targetTypeId: string,
) {
  const ts = now();
  await env.DB.prepare(
    "INSERT INTO edge_types (id, graph_id, name, slug, directed, source_node_type_id, target_node_type_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, graphId, name, slug, directed, sourceTypeId, targetTypeId, ts, ts)
    .run();
}

async function insertNodeTypeField(
  nodeTypeId: string,
  id: string,
  name: string,
  slug: string,
  fieldType: string,
  ordinal: number,
  config: string = "{}",
) {
  const ts = now();
  await env.DB.prepare(
    "INSERT INTO node_type_fields (id, node_type_id, name, slug, field_type, ordinal, required, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)",
  )
    .bind(id, nodeTypeId, name, slug, fieldType, ordinal, config, ts, ts)
    .run();
}

async function insertEdgeTypeField(
  edgeTypeId: string,
  id: string,
  name: string,
  slug: string,
  fieldType: string,
  ordinal: number,
  config: string = "{}",
) {
  const ts = now();
  await env.DB.prepare(
    "INSERT INTO edge_type_fields (id, edge_type_id, name, slug, field_type, ordinal, required, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)",
  )
    .bind(id, edgeTypeId, name, slug, fieldType, ordinal, config, ts, ts)
    .run();
}

async function insertNode(
  id: string,
  graphId: string,
  nodeTypeId: string,
  data: Record<string, unknown> = {},
) {
  const ts = now();
  await env.DB.prepare(
    "INSERT INTO nodes (id, graph_id, node_type_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, graphId, nodeTypeId, JSON.stringify(data), ts, ts)
    .run();
}

async function insertEdge(
  id: string,
  graphId: string,
  edgeTypeId: string,
  sourceId: string,
  targetId: string,
  data: Record<string, unknown> = {},
) {
  const ts = now();
  await env.DB.prepare(
    "INSERT INTO edges (id, graph_id, edge_type_id, source_node_id, target_node_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, graphId, edgeTypeId, sourceId, targetId, JSON.stringify(data), ts, ts)
    .run();
}

// ---------------------------------------------------------------------------
// API call helpers
// ---------------------------------------------------------------------------

async function fetchViewData(graphId: string) {
  const res = await SELF.fetch(
    `http://localhost/api/v1/graphs/${graphId}/view-data`,
  );
  return {
    status: res.status,
    body: await res.json<ViewDataResponse | ErrorBody>(),
  };
}

function createExecutionContextStub() {
  const tasks: Promise<unknown>[] = [];
  const executionCtx = {
    waitUntil(promise: Promise<unknown>) {
      tasks.push(promise);
    },
    passThroughOnException() {},
  } as ExecutionContext;

  return {
    executionCtx,
    async waitForTasks() {
      await Promise.all(tasks);
    },
  };
}

/** Make a request without DEV_AUTH_BYPASS (unauthenticated) */
async function requestWithoutBypass(path: string, init?: RequestInit) {
  const ctx = createExecutionContextStub();
  const response = await app.request(
    `http://localhost${path}`,
    init,
    { ...env, DEV_AUTH_BYPASS: "false" },
    ctx.executionCtx,
  );
  return response;
}

// ---------------------------------------------------------------------------
// Unique counter
// ---------------------------------------------------------------------------
let counter = 0;
function uid(prefix = "vd") {
  return `${prefix}-${++counter}-${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /graphs/:graphId/view-data", () => {
  // =========================================================================
  // Access Control
  // =========================================================================

  describe("access control", () => {
    it("returns 401 for unauthenticated request", async () => {
      // Create a graph owned by the dev user (so it exists in DB)
      const graphId = uid("g");
      await insertUser(DEV_USER_ID, "dev@lattice.local", "Dev User");
      await insertGraph(graphId, DEV_USER_ID, "Auth Test Graph");

      const res = await requestWithoutBypass(
        `/api/v1/graphs/${graphId}/view-data`,
      );
      expect(res.status).toBe(401);

      const body = await res.json<ErrorBody>();
      expect(body.error.message).toContain("Authentication");
    });

    it("returns 403 for another user's graph", async () => {
      // Create a graph owned by a different user
      const graphId = uid("g");
      await insertUser(OTHER_USER_ID, "other@example.com", "Other User");
      await insertGraph(graphId, OTHER_USER_ID, "Other User Graph");

      // Access as dev user (via SELF which uses DEV_AUTH_BYPASS)
      const { status, body } = await fetchViewData(graphId);
      expect(status).toBe(403);

      const err = body as ErrorBody;
      expect(err.error.message).toBe("Forbidden");
    });

    it("returns 404 for non-existent graph", async () => {
      const { status, body } = await fetchViewData("nonexistent-graph-id");
      expect(status).toBe(404);

      const err = body as ErrorBody;
      expect(err.error.message).toContain("not found");
    });
  });

  // =========================================================================
  // Empty Graph
  // =========================================================================

  describe("empty graph", () => {
    it("returns empty arrays and truncated=false", async () => {
      const graphId = uid("g");
      await insertUser(DEV_USER_ID, "dev@lattice.local", "Dev User");
      await insertGraph(graphId, DEV_USER_ID, "Empty Graph");

      const { status, body } = await fetchViewData(graphId);
      expect(status).toBe(200);

      const data = (body as ViewDataResponse).data;
      expect(data.nodes).toEqual([]);
      expect(data.edges).toEqual([]);
      expect(data.node_types).toEqual([]);
      expect(data.edge_types).toEqual([]);
      expect(data.truncated).toBe(false);
      expect(data.counts).toEqual({
        nodes: 0,
        edges: 0,
        node_limit: 1000,
        edge_limit: 5000,
      });
    });
  });

  // =========================================================================
  // Basic Data
  // =========================================================================

  describe("basic data", () => {
    it("returns nodes and edges with all expected fields", async () => {
      const graphId = uid("g");
      await insertUser(DEV_USER_ID, "dev@lattice.local", "Dev User");
      await insertGraph(graphId, DEV_USER_ID, "Basic Data Graph");

      // Create node types
      const ntPerson = uid("nt");
      const ntCompany = uid("nt");
      await insertNodeType(ntPerson, graphId, "Person", "person");
      await insertNodeType(ntCompany, graphId, "Company", "company");

      // Create edge type
      const etWorksAt = uid("et");
      await insertEdgeType(
        etWorksAt,
        graphId,
        "works_at",
        "works_at",
        1,
        ntPerson,
        ntCompany,
      );

      // Create nodes
      const nodeAlice = uid("node");
      const nodeAcme = uid("node");
      await insertNode(nodeAlice, graphId, ntPerson, { name: "Alice" });
      await insertNode(nodeAcme, graphId, ntCompany, { name: "Acme Corp" });

      // Create edge
      const edgeId = uid("edge");
      await insertEdge(edgeId, graphId, etWorksAt, nodeAlice, nodeAcme, {
        role: "Engineer",
      });

      const { status, body } = await fetchViewData(graphId);
      expect(status).toBe(200);

      const data = (body as ViewDataResponse).data;

      // Nodes
      expect(data.nodes).toHaveLength(2);
      const alice = data.nodes.find((n) => n.id === nodeAlice);
      expect(alice).toBeDefined();
      expect(alice!.graph_id).toBe(graphId);
      expect(alice!.node_type_id).toBe(ntPerson);
      expect(alice!.data).toEqual({ name: "Alice" });
      expect(alice!.created_at).toBeTruthy();
      expect(alice!.updated_at).toBeTruthy();

      const acme = data.nodes.find((n) => n.id === nodeAcme);
      expect(acme).toBeDefined();
      expect(acme!.data).toEqual({ name: "Acme Corp" });

      // Edges
      expect(data.edges).toHaveLength(1);
      const edge = data.edges[0];
      expect(edge.id).toBe(edgeId);
      expect(edge.graph_id).toBe(graphId);
      expect(edge.edge_type_id).toBe(etWorksAt);
      expect(edge.source_node_id).toBe(nodeAlice);
      expect(edge.target_node_id).toBe(nodeAcme);
      expect(edge.data).toEqual({ role: "Engineer" });
      expect(edge.created_at).toBeTruthy();
      expect(edge.updated_at).toBeTruthy();

      // Node types
      expect(data.node_types).toHaveLength(2);
      const companyType = data.node_types.find((t) => t.id === ntCompany);
      expect(companyType).toBeDefined();
      expect(companyType!.name).toBe("Company");
      expect(companyType!.slug).toBe("company");

      // Edge types
      expect(data.edge_types).toHaveLength(1);
      const worksAtType = data.edge_types[0];
      expect(worksAtType.id).toBe(etWorksAt);
      expect(worksAtType.name).toBe("works_at");
      expect(worksAtType.slug).toBe("works_at");
      expect(worksAtType.directed).toBe(true);
      expect(worksAtType.source_node_type_id).toBe(ntPerson);
      expect(worksAtType.target_node_type_id).toBe(ntCompany);

      // Truncation
      expect(data.truncated).toBe(false);
      expect(data.counts.nodes).toBe(2);
      expect(data.counts.edges).toBe(1);
    });

    it("node type fields are embedded and ordered by ordinal", async () => {
      const graphId = uid("g");
      await insertUser(DEV_USER_ID, "dev@lattice.local", "Dev User");
      await insertGraph(graphId, DEV_USER_ID, "Fields Graph");

      const ntId = uid("nt");
      await insertNodeType(ntId, graphId, "Person", "person");

      // Insert fields with non-sequential ordinals to verify ordering
      const fieldAge = uid("f");
      const fieldName = uid("f");
      const fieldEmail = uid("f");
      await insertNodeTypeField(ntId, fieldName, "Name", "name", "text", 0);
      await insertNodeTypeField(ntId, fieldEmail, "Email", "email", "email", 1);
      await insertNodeTypeField(ntId, fieldAge, "Age", "age", "number", 2);

      const { status, body } = await fetchViewData(graphId);
      expect(status).toBe(200);

      const data = (body as ViewDataResponse).data;
      expect(data.node_types).toHaveLength(1);

      const personType = data.node_types[0];
      expect(personType.fields).toHaveLength(3);

      // Verify fields are ordered by ordinal
      expect(personType.fields[0].slug).toBe("name");
      expect(personType.fields[0].ordinal).toBe(0);
      expect(personType.fields[1].slug).toBe("email");
      expect(personType.fields[1].ordinal).toBe(1);
      expect(personType.fields[2].slug).toBe("age");
      expect(personType.fields[2].ordinal).toBe(2);

      // Verify field properties
      expect(personType.fields[0].name).toBe("Name");
      expect(personType.fields[0].field_type).toBe("text");
      expect(personType.fields[0].required).toBe(false);
      expect(personType.fields[0].config).toEqual({});
      expect(personType.fields[0].id).toBe(fieldName);
      expect(personType.fields[0].created_at).toBeTruthy();
      expect(personType.fields[0].updated_at).toBeTruthy();
    });

    it("edge type fields are embedded in edge_types array", async () => {
      const graphId = uid("g");
      await insertUser(DEV_USER_ID, "dev@lattice.local", "Dev User");
      await insertGraph(graphId, DEV_USER_ID, "Edge Fields Graph");

      const ntSource = uid("nt");
      const ntTarget = uid("nt");
      await insertNodeType(ntSource, graphId, "Source", "source");
      await insertNodeType(ntTarget, graphId, "Target", "target");

      const etId = uid("et");
      await insertEdgeType(etId, graphId, "relates_to", "relates_to", 1, ntSource, ntTarget);

      // Insert edge type fields
      const efWeight = uid("ef");
      const efLabel = uid("ef");
      await insertEdgeTypeField(etId, efWeight, "Weight", "weight", "number", 0);
      await insertEdgeTypeField(etId, efLabel, "Label", "label", "text", 1);

      const { status, body } = await fetchViewData(graphId);
      expect(status).toBe(200);

      const data = (body as ViewDataResponse).data;
      expect(data.edge_types).toHaveLength(1);

      const edgeType = data.edge_types[0];
      expect(edgeType.fields).toHaveLength(2);
      expect(edgeType.fields[0].slug).toBe("weight");
      expect(edgeType.fields[0].field_type).toBe("number");
      expect(edgeType.fields[0].ordinal).toBe(0);
      expect(edgeType.fields[1].slug).toBe("label");
      expect(edgeType.fields[1].field_type).toBe("text");
      expect(edgeType.fields[1].ordinal).toBe(1);
    });

    it("node data JSON is correctly parsed (not returned as string)", async () => {
      const graphId = uid("g");
      await insertUser(DEV_USER_ID, "dev@lattice.local", "Dev User");
      await insertGraph(graphId, DEV_USER_ID, "JSON Parse Graph");

      const ntId = uid("nt");
      await insertNodeType(ntId, graphId, "Item", "item");

      const nodeId = uid("node");
      await insertNode(nodeId, graphId, ntId, {
        title: "Test",
        count: 42,
        tags: ["a", "b"],
        active: true,
      });

      const { status, body } = await fetchViewData(graphId);
      expect(status).toBe(200);

      const data = (body as ViewDataResponse).data;
      const node = data.nodes[0];

      expect(typeof node.data).toBe("object");
      expect(node.data.title).toBe("Test");
      expect(node.data.count).toBe(42);
      expect(node.data.tags).toEqual(["a", "b"]);
      expect(node.data.active).toBe(true);
    });

    it("edge data JSON is correctly parsed", async () => {
      const graphId = uid("g");
      await insertUser(DEV_USER_ID, "dev@lattice.local", "Dev User");
      await insertGraph(graphId, DEV_USER_ID, "Edge JSON Graph");

      const ntA = uid("nt");
      const ntB = uid("nt");
      await insertNodeType(ntA, graphId, "A", "a");
      await insertNodeType(ntB, graphId, "B", "b");

      const etId = uid("et");
      await insertEdgeType(etId, graphId, "link", "link", 1, ntA, ntB);

      const nodeA = uid("node");
      const nodeB = uid("node");
      await insertNode(nodeA, graphId, ntA);
      await insertNode(nodeB, graphId, ntB);

      const edgeId = uid("edge");
      await insertEdge(edgeId, graphId, etId, nodeA, nodeB, {
        weight: 3.14,
        label: "important",
      });

      const { status, body } = await fetchViewData(graphId);
      expect(status).toBe(200);

      const data = (body as ViewDataResponse).data;
      const edge = data.edges[0];

      expect(typeof edge.data).toBe("object");
      expect(edge.data.weight).toBe(3.14);
      expect(edge.data.label).toBe("important");
    });

    it("edge type directed field is returned as boolean", async () => {
      const graphId = uid("g");
      await insertUser(DEV_USER_ID, "dev@lattice.local", "Dev User");
      await insertGraph(graphId, DEV_USER_ID, "Directed Graph");

      const ntA = uid("nt");
      const ntB = uid("nt");
      await insertNodeType(ntA, graphId, "A", "a");
      await insertNodeType(ntB, graphId, "B", "b");

      // Create a directed edge type (directed = 1)
      const etDirected = uid("et");
      await insertEdgeType(etDirected, graphId, "directed_edge", "directed_edge", 1, ntA, ntB);

      // Create an undirected edge type (directed = 0)
      const etUndirected = uid("et");
      await insertEdgeType(etUndirected, graphId, "undirected_edge", "undirected_edge", 0, ntA, ntB);

      const { status, body } = await fetchViewData(graphId);
      expect(status).toBe(200);

      const data = (body as ViewDataResponse).data;
      const directed = data.edge_types.find((t) => t.id === etDirected);
      const undirected = data.edge_types.find((t) => t.id === etUndirected);

      expect(directed!.directed).toBe(true);
      expect(undirected!.directed).toBe(false);
    });

    it("field config JSON is correctly parsed", async () => {
      const graphId = uid("g");
      await insertUser(DEV_USER_ID, "dev@lattice.local", "Dev User");
      await insertGraph(graphId, DEV_USER_ID, "Config Parse Graph");

      const ntId = uid("nt");
      await insertNodeType(ntId, graphId, "Choices", "choices");

      const fieldId = uid("f");
      await insertNodeTypeField(
        ntId,
        fieldId,
        "Status",
        "status",
        "select",
        0,
        JSON.stringify({ options: ["active", "inactive", "archived"] }),
      );

      const { status, body } = await fetchViewData(graphId);
      expect(status).toBe(200);

      const data = (body as ViewDataResponse).data;
      const field = data.node_types[0].fields[0];
      expect(field.config).toEqual({
        options: ["active", "inactive", "archived"],
      });
    });

    it("node types with no fields have empty fields array", async () => {
      const graphId = uid("g");
      await insertUser(DEV_USER_ID, "dev@lattice.local", "Dev User");
      await insertGraph(graphId, DEV_USER_ID, "No Fields Graph");

      const ntId = uid("nt");
      await insertNodeType(ntId, graphId, "Bare", "bare");

      const { status, body } = await fetchViewData(graphId);
      expect(status).toBe(200);

      const data = (body as ViewDataResponse).data;
      expect(data.node_types).toHaveLength(1);
      expect(data.node_types[0].fields).toEqual([]);
    });

    it("edge types with no fields have empty fields array", async () => {
      const graphId = uid("g");
      await insertUser(DEV_USER_ID, "dev@lattice.local", "Dev User");
      await insertGraph(graphId, DEV_USER_ID, "No Edge Fields Graph");

      const ntA = uid("nt");
      const ntB = uid("nt");
      await insertNodeType(ntA, graphId, "A", "a");
      await insertNodeType(ntB, graphId, "B", "b");

      const etId = uid("et");
      await insertEdgeType(etId, graphId, "link", "link", 1, ntA, ntB);

      const { status, body } = await fetchViewData(graphId);
      expect(status).toBe(200);

      const data = (body as ViewDataResponse).data;
      expect(data.edge_types).toHaveLength(1);
      expect(data.edge_types[0].fields).toEqual([]);
    });
  });

  // =========================================================================
  // Cross-graph Isolation
  // =========================================================================

  describe("cross-graph isolation", () => {
    it("does not include nodes or edges from other graphs", async () => {
      await insertUser(DEV_USER_ID, "dev@lattice.local", "Dev User");

      // Graph A (the one we query)
      const graphA = uid("g");
      await insertGraph(graphA, DEV_USER_ID, "Graph A");
      const ntA = uid("nt");
      await insertNodeType(ntA, graphA, "TypeA", "type_a");
      const nodeA = uid("node");
      await insertNode(nodeA, graphA, ntA, { label: "in-graph-a" });

      // Graph B (a different graph owned by the same user)
      const graphB = uid("g");
      await insertGraph(graphB, DEV_USER_ID, "Graph B");
      const ntB = uid("nt");
      await insertNodeType(ntB, graphB, "TypeB", "type_b");
      const nodeB = uid("node");
      await insertNode(nodeB, graphB, ntB, { label: "in-graph-b" });

      // Create an edge type and edge in graph B
      const etB = uid("et");
      await insertEdgeType(etB, graphB, "link_b", "link_b", 1, ntB, ntB);
      const nodeB2 = uid("node");
      await insertNode(nodeB2, graphB, ntB, { label: "in-graph-b-2" });
      const edgeB = uid("edge");
      await insertEdge(edgeB, graphB, etB, nodeB, nodeB2);

      // Query Graph A
      const { status, body } = await fetchViewData(graphA);
      expect(status).toBe(200);

      const data = (body as ViewDataResponse).data;

      // Only Graph A data should be present
      expect(data.nodes).toHaveLength(1);
      expect(data.nodes[0].id).toBe(nodeA);
      expect(data.nodes[0].data).toEqual({ label: "in-graph-a" });

      expect(data.edges).toHaveLength(0);

      expect(data.node_types).toHaveLength(1);
      expect(data.node_types[0].id).toBe(ntA);

      expect(data.edge_types).toHaveLength(0);
    });

    it("does not include node types or edge types from other graphs", async () => {
      await insertUser(DEV_USER_ID, "dev@lattice.local", "Dev User");

      const graphA = uid("g");
      await insertGraph(graphA, DEV_USER_ID, "Isolated A");
      const ntA1 = uid("nt");
      const ntA2 = uid("nt");
      await insertNodeType(ntA1, graphA, "PersonA", "person_a");
      await insertNodeType(ntA2, graphA, "CompanyA", "company_a");
      const etA = uid("et");
      await insertEdgeType(etA, graphA, "works_at_a", "works_at_a", 1, ntA1, ntA2);

      const graphB = uid("g");
      await insertGraph(graphB, DEV_USER_ID, "Isolated B");
      const ntB = uid("nt");
      await insertNodeType(ntB, graphB, "ThingB", "thing_b");

      // Query Graph A - should not see Graph B types
      const { body } = await fetchViewData(graphA);
      const data = (body as ViewDataResponse).data;

      const typeIds = data.node_types.map((t) => t.id);
      expect(typeIds).toContain(ntA1);
      expect(typeIds).toContain(ntA2);
      expect(typeIds).not.toContain(ntB);

      expect(data.edge_types).toHaveLength(1);
      expect(data.edge_types[0].id).toBe(etA);
    });
  });

  // =========================================================================
  // Truncation
  // =========================================================================

  describe("truncation", () => {
    // TODO: Test that inserting >1000 nodes sets truncated=true and returns
    // exactly 1000 nodes. Inserting 1001 rows in a test environment may be
    // slow, so this is left as a TODO. If performance allows, uncomment and
    // run the test below.

    it("returns truncated=true when node count exceeds 1000", async () => {
      const graphId = uid("g");
      await insertUser(DEV_USER_ID, "dev@lattice.local", "Dev User");
      await insertGraph(graphId, DEV_USER_ID, "Truncation Graph");

      const ntId = uid("nt");
      await insertNodeType(ntId, graphId, "Bulk", "bulk");

      // Insert 1001 nodes using batch for performance
      const batchSize = 100;
      const totalNodes = 1001;
      for (let batch = 0; batch < Math.ceil(totalNodes / batchSize); batch++) {
        const stmts = [];
        const start = batch * batchSize;
        const end = Math.min(start + batchSize, totalNodes);
        const ts = now();
        for (let i = start; i < end; i++) {
          stmts.push(
            env.DB.prepare(
              "INSERT INTO nodes (id, graph_id, node_type_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            ).bind(`bulk-node-${i}`, graphId, ntId, "{}", ts, ts),
          );
        }
        await env.DB.batch(stmts);
      }

      const { status, body } = await fetchViewData(graphId);
      expect(status).toBe(200);

      const data = (body as ViewDataResponse).data;
      expect(data.truncated).toBe(true);
      // The endpoint fetches LIMIT+1 rows and slices to LIMIT
      expect(data.nodes).toHaveLength(1000);
      // counts.nodes reflects the raw row count before slicing (1001)
      expect(data.counts.nodes).toBe(1001);
    });

    it("returns truncated=false when node count is exactly 1000", async () => {
      const graphId = uid("g");
      await insertUser(DEV_USER_ID, "dev@lattice.local", "Dev User");
      await insertGraph(graphId, DEV_USER_ID, "Exact Limit Graph");

      const ntId = uid("nt");
      await insertNodeType(ntId, graphId, "Exact", "exact");

      // Insert exactly 1000 nodes
      const batchSize = 100;
      const totalNodes = 1000;
      for (let batch = 0; batch < Math.ceil(totalNodes / batchSize); batch++) {
        const stmts = [];
        const start = batch * batchSize;
        const end = Math.min(start + batchSize, totalNodes);
        const ts = now();
        for (let i = start; i < end; i++) {
          stmts.push(
            env.DB.prepare(
              "INSERT INTO nodes (id, graph_id, node_type_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            ).bind(`exact-node-${i}`, graphId, ntId, "{}", ts, ts),
          );
        }
        await env.DB.batch(stmts);
      }

      const { status, body } = await fetchViewData(graphId);
      expect(status).toBe(200);

      const data = (body as ViewDataResponse).data;
      expect(data.truncated).toBe(false);
      expect(data.nodes).toHaveLength(1000);
      expect(data.counts.nodes).toBe(1000);
    });
  });

  // =========================================================================
  // Multiple types and fields
  // =========================================================================

  describe("multiple types and fields", () => {
    it("returns all node types with their respective fields", async () => {
      const graphId = uid("g");
      await insertUser(DEV_USER_ID, "dev@lattice.local", "Dev User");
      await insertGraph(graphId, DEV_USER_ID, "Multi Type Graph");

      // Type 1 with 2 fields
      const nt1 = uid("nt");
      await insertNodeType(nt1, graphId, "Person", "person");
      const f1a = uid("f");
      const f1b = uid("f");
      await insertNodeTypeField(nt1, f1a, "Name", "name", "text", 0);
      await insertNodeTypeField(nt1, f1b, "Age", "age", "number", 1);

      // Type 2 with 1 field
      const nt2 = uid("nt");
      await insertNodeType(nt2, graphId, "Company", "company");
      const f2a = uid("f");
      await insertNodeTypeField(nt2, f2a, "Website", "website", "url", 0);

      // Type 3 with no fields
      const nt3 = uid("nt");
      await insertNodeType(nt3, graphId, "Tag", "tag");

      const { status, body } = await fetchViewData(graphId);
      expect(status).toBe(200);

      const data = (body as ViewDataResponse).data;
      expect(data.node_types).toHaveLength(3);

      // Node types are ordered by name
      const types = data.node_types;
      const names = types.map((t) => t.name);
      expect(names).toEqual(["Company", "Person", "Tag"]);

      // Verify field counts
      const companyType = types.find((t) => t.id === nt2);
      expect(companyType!.fields).toHaveLength(1);
      expect(companyType!.fields[0].slug).toBe("website");

      const personType = types.find((t) => t.id === nt1);
      expect(personType!.fields).toHaveLength(2);

      const tagType = types.find((t) => t.id === nt3);
      expect(tagType!.fields).toHaveLength(0);
    });

    it("handles multiple edge types between different node types", async () => {
      const graphId = uid("g");
      await insertUser(DEV_USER_ID, "dev@lattice.local", "Dev User");
      await insertGraph(graphId, DEV_USER_ID, "Multi Edge Graph");

      const ntPerson = uid("nt");
      const ntCompany = uid("nt");
      await insertNodeType(ntPerson, graphId, "Person", "person");
      await insertNodeType(ntCompany, graphId, "Company", "company");

      const etWorksAt = uid("et");
      const etFounded = uid("et");
      await insertEdgeType(etWorksAt, graphId, "works_at", "works_at", 1, ntPerson, ntCompany);
      await insertEdgeType(etFounded, graphId, "founded", "founded", 1, ntPerson, ntCompany);

      // Add a field to one edge type
      const efRole = uid("ef");
      await insertEdgeTypeField(etWorksAt, efRole, "Role", "role", "text", 0);

      const { status, body } = await fetchViewData(graphId);
      expect(status).toBe(200);

      const data = (body as ViewDataResponse).data;
      expect(data.edge_types).toHaveLength(2);

      const worksAt = data.edge_types.find((t) => t.id === etWorksAt);
      expect(worksAt!.fields).toHaveLength(1);
      expect(worksAt!.fields[0].slug).toBe("role");

      const founded = data.edge_types.find((t) => t.id === etFounded);
      expect(founded!.fields).toHaveLength(0);
    });
  });
});

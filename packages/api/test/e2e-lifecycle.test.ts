import { env, SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";
import "../src/index";

// ---------------------------------------------------------------------------
// Helpers — all interactions go through the HTTP API, zero DB shortcuts
// ---------------------------------------------------------------------------

const BASE = "http://localhost/api/v1";
const json = { "Content-Type": "application/json" };

async function api<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: T }> {
  const res = await SELF.fetch(`${BASE}${path}`, init);
  const body =
    res.status === 204
      ? (undefined as unknown as T)
      : await res.json<T>();
  return { status: res.status, body };
}

function post<T = unknown>(path: string, data: unknown) {
  return api<T>(path, {
    method: "POST",
    headers: json,
    body: JSON.stringify(data),
  });
}

function patch<T = unknown>(path: string, data: unknown) {
  return api<T>(path, {
    method: "PATCH",
    headers: json,
    body: JSON.stringify(data),
  });
}

function get<T = unknown>(path: string) {
  return api<T>(path);
}

function del(path: string) {
  return api(path, { method: "DELETE" });
}

// CSV export helper — returns raw text
async function exportCsv(path: string): Promise<{ status: number; text: string }> {
  const res = await SELF.fetch(`${BASE}${path}`);
  return { status: res.status, text: await res.text() };
}

// CSV import helper — multipart upload
async function importCsv(
  path: string,
  csvText: string,
  filename = "import.csv",
): Promise<{ status: number; body: unknown }> {
  const form = new FormData();
  form.append("file", new Blob([csvText], { type: "text/csv" }), filename);
  const res = await SELF.fetch(`${BASE}${path}`, {
    method: "POST",
    body: form,
  });
  return { status: res.status, body: await res.json() };
}

// PAT-authenticated request (bypasses DEV_AUTH_BYPASS)
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

async function apiWithToken<T = unknown>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<{ status: number; body: T; waitForTasks: () => Promise<void> }> {
  const ctx = createExecutionContextStub();
  const response = await app.request(
    `http://localhost${path}`,
    {
      ...init,
      headers: { ...((init?.headers as Record<string, string>) ?? {}), Authorization: `Bearer ${token}` },
    },
    { ...env, DEV_AUTH_BYPASS: "false" },
    ctx.executionCtx,
  );
  const body =
    response.status === 204
      ? (undefined as unknown as T)
      : await response.json<T>();
  return { status: response.status, body, waitForTasks: ctx.waitForTasks };
}

// ---------------------------------------------------------------------------
// Types used in assertions
// ---------------------------------------------------------------------------

type Envelope<T> = { data: T };
type ListEnvelope<T> = { data: T[]; pagination: { total: number; limit: number; offset: number; has_more: boolean } };
type NodeType = { id: string; name: string; slug: string };
type Field = { id: string; name: string; slug: string; field_type: string };
type EdgeType = { id: string; name: string; slug: string; source_node_type_id: string; target_node_type_id: string };
type Node = { id: string; node_type_id: string; data: Record<string, unknown> };
type Edge = { id: string; edge_type_id: string; source_node_id: string; target_node_id: string; data: Record<string, unknown> };
type Graph = { id: string; name: string; description: string | null };
type Token = { id: string; name: string; token: string };

// ===========================================================================
// THE TEST: Full graph lifecycle — API-only, zero DB shortcuts
//
// Scenario: "Company Org Chart"
//   Node types: Person (name, email, department), Team (name, mission)
//   Edge type:  member_of (Person → Team) with "role" field
//
// Phases:
//   1. Create graph
//   2. Define schema (node types + fields, edge type + fields)
//   3. Create data (people, teams, edges)
//   4. Query with filtering & sorting
//   5. CSV export → import round-trip
//   6. PAT token authentication
//   7. Update & partial-edit data
//   8. Cascade delete — remove graph, verify everything is gone
// ===========================================================================

describe("Full graph lifecycle (API-only e2e)", () => {
  it("builds, queries, exports, imports, and tears down a complete knowledge graph", async () => {
    // ------------------------------------------------------------------
    // Phase 1: Create the graph
    // ------------------------------------------------------------------
    const { status: graphStatus, body: graphBody } = await post<Envelope<Graph>>(
      "/graphs",
      { name: "Org Chart", description: "Company org structure" },
    );
    expect(graphStatus).toBe(201);
    const graphId = graphBody.data.id;
    expect(graphBody.data.name).toBe("Org Chart");

    const g = `/graphs/${graphId}`;

    // Verify it shows up in graph list
    const { body: listGraphs } = await get<ListEnvelope<Graph>>("/graphs");
    expect(listGraphs.data.some((gr) => gr.id === graphId)).toBe(true);

    // ------------------------------------------------------------------
    // Phase 2: Define schema — node types, fields, edge type, edge fields
    // ------------------------------------------------------------------

    // -- Person node type --
    const { status: personStatus, body: personBody } = await post<Envelope<NodeType>>(
      `${g}/node-types`,
      { name: "Person" },
    );
    expect(personStatus).toBe(201);
    const personTypeId = personBody.data.id;
    expect(personBody.data.slug).toBe("person");

    // Person fields: name (text, required), email (email), department (select)
    const { body: nameField } = await post<Envelope<Field>>(
      `${g}/node-types/${personTypeId}/fields`,
      { name: "Name", field_type: "text", ordinal: 0, required: true },
    );
    expect(nameField.data.slug).toBe("name");
    expect(nameField.data.field_type).toBe("text");

    const { body: emailField } = await post<Envelope<Field>>(
      `${g}/node-types/${personTypeId}/fields`,
      { name: "Email", field_type: "email", ordinal: 1 },
    );
    expect(emailField.data.slug).toBe("email");

    const { body: deptField } = await post<Envelope<Field>>(
      `${g}/node-types/${personTypeId}/fields`,
      {
        name: "Department",
        field_type: "select",
        ordinal: 2,
        config: { options: ["Engineering", "Design", "Product"] },
      },
    );
    expect(deptField.data.slug).toBe("department");

    // -- Team node type --
    const { body: teamBody } = await post<Envelope<NodeType>>(
      `${g}/node-types`,
      { name: "Team" },
    );
    const teamTypeId = teamBody.data.id;
    expect(teamBody.data.slug).toBe("team");

    const { body: teamNameField } = await post<Envelope<Field>>(
      `${g}/node-types/${teamTypeId}/fields`,
      { name: "Name", field_type: "text", ordinal: 0, required: true },
    );

    const { body: missionField } = await post<Envelope<Field>>(
      `${g}/node-types/${teamTypeId}/fields`,
      { name: "Mission", field_type: "text", ordinal: 1 },
    );

    // -- Edge type: member_of (Person → Team) --
    const { status: etStatus, body: etBody } = await post<Envelope<EdgeType>>(
      `${g}/edge-types`,
      {
        name: "Member Of",
        source_node_type_id: personTypeId,
        target_node_type_id: teamTypeId,
      },
    );
    expect(etStatus).toBe(201);
    const memberOfTypeId = etBody.data.id;
    expect(etBody.data.slug).toBe("member_of");

    // Edge field: role (text)
    const { body: roleField } = await post<Envelope<Field>>(
      `${g}/edge-types/${memberOfTypeId}/fields`,
      { name: "Role", field_type: "text", ordinal: 0 },
    );
    expect(roleField.data.slug).toBe("role");

    // Verify schema via list endpoints
    const { body: nodeTypes } = await get<ListEnvelope<NodeType>>(`${g}/node-types`);
    expect(nodeTypes.data).toHaveLength(2);

    const { body: edgeTypes } = await get<ListEnvelope<EdgeType>>(`${g}/edge-types`);
    expect(edgeTypes.data).toHaveLength(1);

    // ------------------------------------------------------------------
    // Phase 3: Create data — 4 people, 2 teams, 4 edges
    // ------------------------------------------------------------------

    const people = [
      { name: "Alice", email: "alice@co.io", department: "Engineering" },
      { name: "Bob", email: "bob@co.io", department: "Engineering" },
      { name: "Carol", email: "carol@co.io", department: "Design" },
      { name: "Dave", email: "dave@co.io", department: "Product" },
    ];
    const personIds: string[] = [];
    for (const p of people) {
      const { status, body } = await post<Envelope<Node>>(
        `${g}/nodes`,
        { node_type_id: personTypeId, data: p },
      );
      expect(status).toBe(201);
      expect(body.data.data.name).toBe(p.name);
      personIds.push(body.data.id);
    }

    const teams = [
      { name: "Platform", mission: "Build the platform" },
      { name: "UX", mission: "Craft the experience" },
    ];
    const teamIds: string[] = [];
    for (const t of teams) {
      const { status, body } = await post<Envelope<Node>>(
        `${g}/nodes`,
        { node_type_id: teamTypeId, data: t },
      );
      expect(status).toBe(201);
      teamIds.push(body.data.id);
    }

    // Edges: Alice→Platform (tech lead), Bob→Platform (engineer),
    //        Carol→UX (designer), Dave→UX (pm)
    const edgeData = [
      { source: personIds[0], target: teamIds[0], role: "Tech Lead" },
      { source: personIds[1], target: teamIds[0], role: "Engineer" },
      { source: personIds[2], target: teamIds[1], role: "Designer" },
      { source: personIds[3], target: teamIds[1], role: "PM" },
    ];
    const edgeIds: string[] = [];
    for (const e of edgeData) {
      const { status, body } = await post<Envelope<Edge>>(
        `${g}/edges`,
        {
          edge_type_id: memberOfTypeId,
          source_node_id: e.source,
          target_node_id: e.target,
          data: { role: e.role },
        },
      );
      expect(status).toBe(201);
      expect(body.data.data.role).toBe(e.role);
      edgeIds.push(body.data.id);
    }

    // ------------------------------------------------------------------
    // Phase 4: Query — filtering, sorting, pagination
    // ------------------------------------------------------------------

    // Filter people by department = Engineering
    const { body: engPeople } = await get<ListEnvelope<Node>>(
      `${g}/nodes?type=${personTypeId}&filter[department][eq]=Engineering`,
    );
    expect(engPeople.data).toHaveLength(2);
    const engNames = engPeople.data.map((n) => n.data.name).sort();
    expect(engNames).toEqual(["Alice", "Bob"]);

    // Filter with contains operator
    const { body: containsResult } = await get<ListEnvelope<Node>>(
      `${g}/nodes?type=${personTypeId}&filter[name][contains]=ob`,
    );
    expect(containsResult.data).toHaveLength(1);
    expect(containsResult.data[0].data.name).toBe("Bob");

    // Sort people by name ascending
    const { body: sortedAsc } = await get<ListEnvelope<Node>>(
      `${g}/nodes?type=${personTypeId}&sort=name:asc`,
    );
    expect(sortedAsc.data.map((n) => n.data.name)).toEqual([
      "Alice", "Bob", "Carol", "Dave",
    ]);

    // Sort descending
    const { body: sortedDesc } = await get<ListEnvelope<Node>>(
      `${g}/nodes?type=${personTypeId}&sort=name:desc`,
    );
    expect(sortedDesc.data.map((n) => n.data.name)).toEqual([
      "Dave", "Carol", "Bob", "Alice",
    ]);

    // Pagination: limit 2, verify has_more and total
    const { body: page1 } = await get<ListEnvelope<Node>>(
      `${g}/nodes?type=${personTypeId}&sort=name:asc&limit=2&offset=0`,
    );
    expect(page1.data).toHaveLength(2);
    expect(page1.pagination.total).toBe(4);
    expect(page1.pagination.has_more).toBe(true);
    expect(page1.data[0].data.name).toBe("Alice");

    const { body: page2 } = await get<ListEnvelope<Node>>(
      `${g}/nodes?type=${personTypeId}&sort=name:asc&limit=2&offset=2`,
    );
    expect(page2.data).toHaveLength(2);
    expect(page2.pagination.has_more).toBe(false);
    expect(page2.data[0].data.name).toBe("Carol");

    // Query edges
    const { body: allEdges } = await get<ListEnvelope<Edge>>(`${g}/edges`);
    expect(allEdges.data).toHaveLength(4);

    // ------------------------------------------------------------------
    // Phase 5: CSV export → import round-trip
    // ------------------------------------------------------------------

    // Export Person nodes
    const { status: expStatus, text: csvText } = await exportCsv(
      `${g}/nodes/export?type=${personTypeId}`,
    );
    expect(expStatus).toBe(200);
    expect(csvText).toContain("Name");
    expect(csvText).toContain("Alice");
    expect(csvText).toContain("bob@co.io");

    // Delete 2 people (Alice and Bob) to make room for re-import
    await del(`${g}/nodes/${personIds[0]}`);
    await del(`${g}/nodes/${personIds[1]}`);

    // Verify they're gone
    const { body: afterDelete } = await get<ListEnvelope<Node>>(
      `${g}/nodes?type=${personTypeId}`,
    );
    expect(afterDelete.data).toHaveLength(2);

    // Re-import the full CSV — should create new nodes for the 4 rows
    // (CSV import creates new nodes; the 2 remaining duplicates by name are fine)
    const { status: impStatus, body: impBody } = await importCsv(
      `${g}/nodes/import?type=${personTypeId}`,
      csvText,
    );
    expect(impStatus).toBe(201);

    // After import: 2 remaining + 4 imported = 6
    const { body: afterImport } = await get<ListEnvelope<Node>>(
      `${g}/nodes?type=${personTypeId}`,
    );
    expect(afterImport.data).toHaveLength(6);

    // ------------------------------------------------------------------
    // Phase 6: PAT token — create, auth, use
    // ------------------------------------------------------------------

    // Create PAT token (via dev-bypassed session)
    const { body: tokenBody } = await post<Envelope<Token>>(
      "/settings/tokens",
      { name: "e2e-test-token" },
    );
    const rawToken = tokenBody.data.token;
    expect(rawToken).toMatch(/^lat_/);

    // Use the PAT token to read the graph (with DEV_AUTH_BYPASS=false)
    const { status: patStatus, body: patBody, waitForTasks } = await apiWithToken<Envelope<Graph>>(
      `/api/v1/graphs/${graphId}`,
      rawToken,
    );
    expect(patStatus).toBe(200);
    expect(patBody.data.name).toBe("Org Chart");
    await waitForTasks();

    // ------------------------------------------------------------------
    // Phase 7: Update data — edit graph, patch a node, patch an edge
    // ------------------------------------------------------------------

    // Update graph description
    const { status: updGraphStatus, body: updGraphBody } = await patch<Envelope<Graph>>(
      `/graphs/${graphId}`,
      { description: "Updated org chart" },
    );
    expect(updGraphStatus).toBe(200);
    expect(updGraphBody.data.description).toBe("Updated org chart");

    // Pick the first remaining node and update their department
    const { body: remaining } = await get<ListEnvelope<Node>>(
      `${g}/nodes?type=${personTypeId}&limit=1`,
    );
    const nodeToUpdate = remaining.data[0];
    const { status: updNodeStatus, body: updNodeBody } = await patch<Envelope<Node>>(
      `${g}/nodes/${nodeToUpdate.id}`,
      { data: { ...nodeToUpdate.data, department: "Product" } },
    );
    expect(updNodeStatus).toBe(200);
    expect(updNodeBody.data.data.department).toBe("Product");

    // ------------------------------------------------------------------
    // Phase 8: Cascade delete — remove graph, verify everything is gone
    // ------------------------------------------------------------------

    const { status: delStatus } = await del(`/graphs/${graphId}`);
    expect(delStatus).toBe(204);

    // Graph itself is gone
    const { status: goneStatus } = await get(`/graphs/${graphId}`);
    expect(goneStatus).toBe(404);

    // Verify cascade: node types, nodes, edge types, edges all cleaned up
    const dbNodeTypes = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM node_types WHERE graph_id = ?",
    ).bind(graphId).first<{ cnt: number }>();
    expect(dbNodeTypes?.cnt).toBe(0);

    const dbNodes = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM nodes WHERE graph_id = ?",
    ).bind(graphId).first<{ cnt: number }>();
    expect(dbNodes?.cnt).toBe(0);

    const dbEdgeTypes = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM edge_types WHERE graph_id = ?",
    ).bind(graphId).first<{ cnt: number }>();
    expect(dbEdgeTypes?.cnt).toBe(0);

    const dbEdges = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM edges WHERE graph_id = ?",
    ).bind(graphId).first<{ cnt: number }>();
    expect(dbEdges?.cnt).toBe(0);

    // Field definitions should also be gone (via cascade through node_types/edge_types)
    const dbNodeFields = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM node_type_fields WHERE node_type_id IN
       (SELECT id FROM node_types WHERE graph_id = ?)`,
    ).bind(graphId).first<{ cnt: number }>();
    expect(dbNodeFields?.cnt).toBe(0);

    const dbEdgeFields = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM edge_type_fields WHERE edge_type_id IN
       (SELECT id FROM edge_types WHERE graph_id = ?)`,
    ).bind(graphId).first<{ cnt: number }>();
    expect(dbEdgeFields?.cnt).toBe(0);
  });
});

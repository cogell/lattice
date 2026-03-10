import { env, SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Envelope<T> = { data: T };
type ListEnvelope<T> = { data: T[]; pagination: { total: number; limit: number; offset: number; has_more: boolean } };
type NodeType = { id: string; name: string; slug: string; display_field_slug: string | null; color: string | null; icon: string | null };
type Field = { id: string; name: string; slug: string; field_type: string; ordinal: number; required: boolean; config: Record<string, unknown> };
type EdgeType = { id: string; name: string; slug: string; directed: boolean; source_node_type_id: string; target_node_type_id: string };
type Node = { id: string; node_type_id: string; data: Record<string, unknown> };
type Edge = { id: string; edge_type_id: string; source_node_id: string; target_node_id: string; data: Record<string, unknown> };
type Graph = { id: string; name: string; description: string | null };

type ViewData = {
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

// ===========================================================================
// Graph Visualization Pipeline (e2e)
//
// Scenario: "Software Architecture Map"
//   Node types:
//     Service  — name (text, display), language (select), repo_url (url)
//     Database — name (text, display), engine (select), managed (boolean)
//     Team     — name (text, display), email (email)
//
//   Edge types:
//     depends_on  — Service → Service (directed, self-referential)
//     reads_from  — Service → Database (directed)
//     writes_to   — Service → Database (directed)
//     owns        — Team → Service (undirected-style, but API may default)
//
// Phases:
//   1. Create graph + full schema with colors, icons, display fields
//   2. Populate data (services, databases, teams, edges)
//   3. Query view-data → validate complete visualization payload
//   4. Mutate graph (add nodes/edges, update display_field_slug)
//   5. Re-query view-data → verify mutations reflected
//   6. Schema evolution → add field, verify view-data includes it
//   7. Delete nodes → cascade edges → verify view-data consistency
//   8. Cross-graph isolation — second graph's data never leaks
//   9. Cleanup + cascade verification
// ===========================================================================

describe("Graph visualization pipeline (e2e)", () => {
  it("builds a multi-type graph, validates view-data at each mutation, and verifies cross-graph isolation", async () => {
    // ------------------------------------------------------------------
    // Phase 1: Create graph + full schema
    // ------------------------------------------------------------------
    const { status: graphStatus, body: graphBody } = await post<Envelope<Graph>>(
      "/graphs",
      { name: "Architecture Map", description: "Service dependency graph" },
    );
    expect(graphStatus).toBe(201);
    const graphId = graphBody.data.id;
    const g = `/graphs/${graphId}`;

    // -- Service node type --
    const { body: serviceTypeBody } = await post<Envelope<NodeType>>(
      `${g}/node-types`,
      { name: "Service", color: "#3B82F6", icon: "server" },
    );
    const serviceTypeId = serviceTypeBody.data.id;
    expect(serviceTypeBody.data.slug).toBe("service");
    expect(serviceTypeBody.data.color).toBe("#3B82F6");
    expect(serviceTypeBody.data.icon).toBe("server");

    const { body: svcNameField } = await post<Envelope<Field>>(
      `${g}/node-types/${serviceTypeId}/fields`,
      { name: "Name", field_type: "text", ordinal: 0, required: true },
    );
    const { body: svcLangField } = await post<Envelope<Field>>(
      `${g}/node-types/${serviceTypeId}/fields`,
      {
        name: "Language",
        field_type: "select",
        ordinal: 1,
        config: { options: ["TypeScript", "Go", "Python", "Rust"] },
      },
    );
    const { body: svcRepoField } = await post<Envelope<Field>>(
      `${g}/node-types/${serviceTypeId}/fields`,
      { name: "Repo URL", field_type: "url", ordinal: 2 },
    );

    // Set display field
    const { status: displayStatus } = await patch<Envelope<NodeType>>(
      `${g}/node-types/${serviceTypeId}`,
      { display_field_slug: "name" },
    );
    expect(displayStatus).toBe(200);

    // -- Database node type --
    const { body: dbTypeBody } = await post<Envelope<NodeType>>(
      `${g}/node-types`,
      { name: "Database", color: "#10B981", icon: "database" },
    );
    const dbTypeId = dbTypeBody.data.id;

    const { body: dbNameField } = await post<Envelope<Field>>(
      `${g}/node-types/${dbTypeId}/fields`,
      { name: "Name", field_type: "text", ordinal: 0, required: true },
    );
    const { body: dbEngineField } = await post<Envelope<Field>>(
      `${g}/node-types/${dbTypeId}/fields`,
      {
        name: "Engine",
        field_type: "select",
        ordinal: 1,
        config: { options: ["PostgreSQL", "Redis", "D1", "DynamoDB"] },
      },
    );
    const { body: dbManagedField } = await post<Envelope<Field>>(
      `${g}/node-types/${dbTypeId}/fields`,
      { name: "Managed", field_type: "boolean", ordinal: 2 },
    );

    await patch<Envelope<NodeType>>(
      `${g}/node-types/${dbTypeId}`,
      { display_field_slug: "name" },
    );

    // -- Team node type --
    const { body: teamTypeBody } = await post<Envelope<NodeType>>(
      `${g}/node-types`,
      { name: "Team", color: "#F59E0B", icon: "users" },
    );
    const teamTypeId = teamTypeBody.data.id;

    await post<Envelope<Field>>(
      `${g}/node-types/${teamTypeId}/fields`,
      { name: "Name", field_type: "text", ordinal: 0, required: true },
    );
    await post<Envelope<Field>>(
      `${g}/node-types/${teamTypeId}/fields`,
      { name: "Contact Email", field_type: "email", ordinal: 1 },
    );

    await patch<Envelope<NodeType>>(
      `${g}/node-types/${teamTypeId}`,
      { display_field_slug: "name" },
    );

    // -- Edge type: depends_on (Service → Service, directed, self-referential) --
    const { body: depsTypeBody } = await post<Envelope<EdgeType>>(
      `${g}/edge-types`,
      {
        name: "Depends On",
        source_node_type_id: serviceTypeId,
        target_node_type_id: serviceTypeId,
        directed: true,
      },
    );
    const depsTypeId = depsTypeBody.data.id;
    expect(depsTypeBody.data.slug).toBe("depends_on");

    // Edge field: criticality (select)
    await post<Envelope<Field>>(
      `${g}/edge-types/${depsTypeId}/fields`,
      {
        name: "Criticality",
        field_type: "select",
        ordinal: 0,
        config: { options: ["critical", "normal", "optional"] },
      },
    );

    // -- Edge type: reads_from (Service → Database, directed) --
    const { body: readsTypeBody } = await post<Envelope<EdgeType>>(
      `${g}/edge-types`,
      {
        name: "Reads From",
        source_node_type_id: serviceTypeId,
        target_node_type_id: dbTypeId,
        directed: true,
      },
    );
    const readsTypeId = readsTypeBody.data.id;

    // -- Edge type: writes_to (Service → Database, directed) --
    const { body: writesTypeBody } = await post<Envelope<EdgeType>>(
      `${g}/edge-types`,
      {
        name: "Writes To",
        source_node_type_id: serviceTypeId,
        target_node_type_id: dbTypeId,
        directed: true,
      },
    );
    const writesTypeId = writesTypeBody.data.id;

    // -- Edge type: owns (Team → Service) --
    const { body: ownsTypeBody } = await post<Envelope<EdgeType>>(
      `${g}/edge-types`,
      {
        name: "Owns",
        source_node_type_id: teamTypeId,
        target_node_type_id: serviceTypeId,
      },
    );
    const ownsTypeId = ownsTypeBody.data.id;

    // ------------------------------------------------------------------
    // Phase 2: Populate data
    // ------------------------------------------------------------------

    // Services
    const services = [
      { name: "API Gateway", language: "TypeScript", repo_url: "https://github.com/org/api-gateway" },
      { name: "Auth Service", language: "Go", repo_url: "https://github.com/org/auth" },
      { name: "Billing Service", language: "TypeScript", repo_url: "https://github.com/org/billing" },
      { name: "Notification Service", language: "Python", repo_url: "https://github.com/org/notifications" },
    ];
    const serviceIds: string[] = [];
    for (const s of services) {
      const { status, body } = await post<Envelope<Node>>(
        `${g}/nodes`,
        { node_type_id: serviceTypeId, data: s },
      );
      expect(status).toBe(201);
      serviceIds.push(body.data.id);
    }

    // Databases
    const databases = [
      { name: "Users DB", engine: "PostgreSQL", managed: true },
      { name: "Cache", engine: "Redis", managed: true },
      { name: "Billing DB", engine: "D1", managed: true },
    ];
    const dbIds: string[] = [];
    for (const d of databases) {
      const { status, body } = await post<Envelope<Node>>(
        `${g}/nodes`,
        { node_type_id: dbTypeId, data: d },
      );
      expect(status).toBe(201);
      dbIds.push(body.data.id);
    }

    // Teams
    const teams = [
      { name: "Platform", contact_email: "platform@company.io" },
      { name: "Revenue", contact_email: "revenue@company.io" },
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

    // depends_on edges (Service → Service)
    // API Gateway → Auth Service (critical)
    // API Gateway → Billing Service (normal)
    // Billing Service → Notification Service (normal)
    const depEdges = [
      { src: serviceIds[0], tgt: serviceIds[1], data: { criticality: "critical" } },
      { src: serviceIds[0], tgt: serviceIds[2], data: { criticality: "normal" } },
      { src: serviceIds[2], tgt: serviceIds[3], data: { criticality: "normal" } },
    ];
    const depEdgeIds: string[] = [];
    for (const e of depEdges) {
      const { status, body } = await post<Envelope<Edge>>(
        `${g}/edges`,
        {
          edge_type_id: depsTypeId,
          source_node_id: e.src,
          target_node_id: e.tgt,
          data: e.data,
        },
      );
      expect(status).toBe(201);
      depEdgeIds.push(body.data.id);
    }

    // reads_from edges (Service → Database)
    // Auth Service → Users DB, Auth Service → Cache
    // Billing Service → Billing DB
    const readEdges = [
      { src: serviceIds[1], tgt: dbIds[0] },
      { src: serviceIds[1], tgt: dbIds[1] },
      { src: serviceIds[2], tgt: dbIds[2] },
    ];
    const readEdgeIds: string[] = [];
    for (const e of readEdges) {
      const { status, body } = await post<Envelope<Edge>>(
        `${g}/edges`,
        {
          edge_type_id: readsTypeId,
          source_node_id: e.src,
          target_node_id: e.tgt,
          data: {},
        },
      );
      expect(status).toBe(201);
      readEdgeIds.push(body.data.id);
    }

    // writes_to edges (Service → Database)
    // Auth Service → Users DB
    // Billing Service → Billing DB
    const writeEdges = [
      { src: serviceIds[1], tgt: dbIds[0] },
      { src: serviceIds[2], tgt: dbIds[2] },
    ];
    const writeEdgeIds: string[] = [];
    for (const e of writeEdges) {
      const { status, body } = await post<Envelope<Edge>>(
        `${g}/edges`,
        {
          edge_type_id: writesTypeId,
          source_node_id: e.src,
          target_node_id: e.tgt,
          data: {},
        },
      );
      expect(status).toBe(201);
      writeEdgeIds.push(body.data.id);
    }

    // owns edges (Team → Service)
    // Platform → API Gateway, Platform → Auth Service
    // Revenue → Billing Service, Revenue → Notification Service
    const ownEdges = [
      { src: teamIds[0], tgt: serviceIds[0] },
      { src: teamIds[0], tgt: serviceIds[1] },
      { src: teamIds[1], tgt: serviceIds[2] },
      { src: teamIds[1], tgt: serviceIds[3] },
    ];
    const ownEdgeIds: string[] = [];
    for (const e of ownEdges) {
      const { status, body } = await post<Envelope<Edge>>(
        `${g}/edges`,
        {
          edge_type_id: ownsTypeId,
          source_node_id: e.src,
          target_node_id: e.tgt,
          data: {},
        },
      );
      expect(status).toBe(201);
      ownEdgeIds.push(body.data.id);
    }

    // Verify totals via standard API
    const { body: allNodes } = await get<ListEnvelope<Node>>(`${g}/nodes`);
    expect(allNodes.pagination.total).toBe(9); // 4 services + 3 dbs + 2 teams
    const { body: allEdges } = await get<ListEnvelope<Edge>>(`${g}/edges`);
    expect(allEdges.pagination.total).toBe(12); // 3 deps + 3 reads + 2 writes + 4 owns

    // ------------------------------------------------------------------
    // Phase 3: Query view-data — validate complete visualization payload
    // ------------------------------------------------------------------

    const { status: vdStatus, body: vd } = await get<ViewData>(
      `${g}/view-data`,
    );
    expect(vdStatus).toBe(200);

    // Counts
    expect(vd.data.truncated).toBe(false);
    expect(vd.data.counts.nodes).toBe(9);
    expect(vd.data.counts.edges).toBe(12);
    expect(vd.data.counts.node_limit).toBe(1000);
    expect(vd.data.counts.edge_limit).toBe(5000);

    // All nodes present with correct data
    expect(vd.data.nodes).toHaveLength(9);
    const vdServiceNodes = vd.data.nodes.filter((n) => n.node_type_id === serviceTypeId);
    expect(vdServiceNodes).toHaveLength(4);
    const vdApiGateway = vdServiceNodes.find((n) => n.data.name === "API Gateway");
    expect(vdApiGateway).toBeDefined();
    expect(vdApiGateway!.data.language).toBe("TypeScript");
    expect(vdApiGateway!.data.repo_url).toBe("https://github.com/org/api-gateway");
    expect(vdApiGateway!.graph_id).toBe(graphId);

    const vdDbNodes = vd.data.nodes.filter((n) => n.node_type_id === dbTypeId);
    expect(vdDbNodes).toHaveLength(3);
    const vdUsersDb = vdDbNodes.find((n) => n.data.name === "Users DB");
    expect(vdUsersDb).toBeDefined();
    expect(vdUsersDb!.data.engine).toBe("PostgreSQL");
    expect(vdUsersDb!.data.managed).toBe(true);

    const vdTeamNodes = vd.data.nodes.filter((n) => n.node_type_id === teamTypeId);
    expect(vdTeamNodes).toHaveLength(2);

    // All edges present
    expect(vd.data.edges).toHaveLength(12);
    const vdDepEdges = vd.data.edges.filter((e) => e.edge_type_id === depsTypeId);
    expect(vdDepEdges).toHaveLength(3);
    // Verify edge data is parsed (not raw JSON string)
    const criticalEdge = vdDepEdges.find(
      (e) => e.source_node_id === serviceIds[0] && e.target_node_id === serviceIds[1],
    );
    expect(criticalEdge).toBeDefined();
    expect(criticalEdge!.data.criticality).toBe("critical");

    const vdReadEdges = vd.data.edges.filter((e) => e.edge_type_id === readsTypeId);
    expect(vdReadEdges).toHaveLength(3);
    const vdWriteEdges = vd.data.edges.filter((e) => e.edge_type_id === writesTypeId);
    expect(vdWriteEdges).toHaveLength(2);
    const vdOwnEdges = vd.data.edges.filter((e) => e.edge_type_id === ownsTypeId);
    expect(vdOwnEdges).toHaveLength(4);

    // Node types with embedded fields
    expect(vd.data.node_types).toHaveLength(3);

    const vdServiceType = vd.data.node_types.find((t) => t.id === serviceTypeId)!;
    expect(vdServiceType.name).toBe("Service");
    expect(vdServiceType.slug).toBe("service");
    expect(vdServiceType.color).toBe("#3B82F6");
    expect(vdServiceType.icon).toBe("server");
    expect(vdServiceType.display_field_slug).toBe("name");
    expect(vdServiceType.fields).toHaveLength(3);
    // Fields ordered by ordinal
    expect(vdServiceType.fields[0].slug).toBe("name");
    expect(vdServiceType.fields[0].field_type).toBe("text");
    expect(vdServiceType.fields[0].required).toBe(true);
    expect(vdServiceType.fields[1].slug).toBe("language");
    expect(vdServiceType.fields[1].field_type).toBe("select");
    expect(vdServiceType.fields[1].config).toEqual({ options: ["TypeScript", "Go", "Python", "Rust"] });
    expect(vdServiceType.fields[2].slug).toBe("repo_url");
    expect(vdServiceType.fields[2].field_type).toBe("url");

    const vdDbType = vd.data.node_types.find((t) => t.id === dbTypeId)!;
    expect(vdDbType.name).toBe("Database");
    expect(vdDbType.color).toBe("#10B981");
    expect(vdDbType.icon).toBe("database");
    expect(vdDbType.display_field_slug).toBe("name");
    expect(vdDbType.fields).toHaveLength(3);

    const vdTeamType = vd.data.node_types.find((t) => t.id === teamTypeId)!;
    expect(vdTeamType.name).toBe("Team");
    expect(vdTeamType.color).toBe("#F59E0B");
    expect(vdTeamType.display_field_slug).toBe("name");
    expect(vdTeamType.fields).toHaveLength(2);

    // Edge types with embedded fields
    expect(vd.data.edge_types).toHaveLength(4);

    const vdDepsType = vd.data.edge_types.find((t) => t.id === depsTypeId)!;
    expect(vdDepsType.name).toBe("Depends On");
    expect(vdDepsType.slug).toBe("depends_on");
    expect(vdDepsType.directed).toBe(true);
    expect(vdDepsType.source_node_type_id).toBe(serviceTypeId);
    expect(vdDepsType.target_node_type_id).toBe(serviceTypeId);
    expect(vdDepsType.fields).toHaveLength(1);
    expect(vdDepsType.fields[0].slug).toBe("criticality");
    expect(vdDepsType.fields[0].field_type).toBe("select");
    expect(vdDepsType.fields[0].config).toEqual({ options: ["critical", "normal", "optional"] });

    const vdReadsType = vd.data.edge_types.find((t) => t.id === readsTypeId)!;
    expect(vdReadsType.directed).toBe(true);
    expect(vdReadsType.fields).toHaveLength(0);

    const vdOwnsType = vd.data.edge_types.find((t) => t.id === ownsTypeId)!;
    expect(vdOwnsType.name).toBe("Owns");
    expect(vdOwnsType.fields).toHaveLength(0);

    // ------------------------------------------------------------------
    // Phase 4: Mutate graph — add nodes/edges, update display_field_slug
    // ------------------------------------------------------------------

    // Add a new service
    const { body: searchBody } = await post<Envelope<Node>>(
      `${g}/nodes`,
      { node_type_id: serviceTypeId, data: { name: "Search Service", language: "Rust", repo_url: "https://github.com/org/search" } },
    );
    const searchServiceId = searchBody.data.id;

    // Add edge: Search Service reads from Cache
    await post<Envelope<Edge>>(
      `${g}/edges`,
      {
        edge_type_id: readsTypeId,
        source_node_id: searchServiceId,
        target_node_id: dbIds[1],
        data: {},
      },
    );

    // Add edge: API Gateway depends on Search Service
    await post<Envelope<Edge>>(
      `${g}/edges`,
      {
        edge_type_id: depsTypeId,
        source_node_id: serviceIds[0],
        target_node_id: searchServiceId,
        data: { criticality: "optional" },
      },
    );

    // Change Service display_field_slug to "language"
    await patch<Envelope<NodeType>>(
      `${g}/node-types/${serviceTypeId}`,
      { display_field_slug: "language" },
    );

    // ------------------------------------------------------------------
    // Phase 5: Re-query view-data — verify mutations reflected
    // ------------------------------------------------------------------

    const { body: vd2 } = await get<ViewData>(`${g}/view-data`);

    // Counts updated
    expect(vd2.data.nodes).toHaveLength(10); // was 9, +1 search service
    expect(vd2.data.edges).toHaveLength(14); // was 12, +2 new edges
    expect(vd2.data.counts.nodes).toBe(10);
    expect(vd2.data.counts.edges).toBe(14);

    // New node is in view-data
    const vdSearch = vd2.data.nodes.find((n) => n.id === searchServiceId);
    expect(vdSearch).toBeDefined();
    expect(vdSearch!.data.name).toBe("Search Service");
    expect(vdSearch!.data.language).toBe("Rust");

    // display_field_slug updated
    const vdServiceType2 = vd2.data.node_types.find((t) => t.id === serviceTypeId)!;
    expect(vdServiceType2.display_field_slug).toBe("language");

    // New edges are in view-data
    const vdDepEdges2 = vd2.data.edges.filter((e) => e.edge_type_id === depsTypeId);
    expect(vdDepEdges2).toHaveLength(4); // was 3, +1
    const optionalEdge = vdDepEdges2.find(
      (e) => e.source_node_id === serviceIds[0] && e.target_node_id === searchServiceId,
    );
    expect(optionalEdge).toBeDefined();
    expect(optionalEdge!.data.criticality).toBe("optional");

    // ------------------------------------------------------------------
    // Phase 6: Schema evolution — add field, verify view-data includes it
    // ------------------------------------------------------------------

    // Add "SLA" (number) field to Service type
    const { body: slaField } = await post<Envelope<Field>>(
      `${g}/node-types/${serviceTypeId}/fields`,
      { name: "SLA", field_type: "number", ordinal: 3 },
    );
    expect(slaField.data.slug).toBe("sla");

    // Update a service to have the new field
    await patch<Envelope<Node>>(
      `${g}/nodes/${serviceIds[0]}`,
      { data: { ...services[0], sla: 99.99 } },
    );

    // Add "priority" field to depends_on edge type
    await post<Envelope<Field>>(
      `${g}/edge-types/${depsTypeId}/fields`,
      { name: "Priority", field_type: "number", ordinal: 1 },
    );

    const { body: vd3 } = await get<ViewData>(`${g}/view-data`);

    // Service type now has 4 fields
    const vdServiceType3 = vd3.data.node_types.find((t) => t.id === serviceTypeId)!;
    expect(vdServiceType3.fields).toHaveLength(4);
    expect(vdServiceType3.fields[3].slug).toBe("sla");
    expect(vdServiceType3.fields[3].field_type).toBe("number");

    // depends_on edge type now has 2 fields
    const vdDepsType3 = vd3.data.edge_types.find((t) => t.id === depsTypeId)!;
    expect(vdDepsType3.fields).toHaveLength(2);
    expect(vdDepsType3.fields[0].slug).toBe("criticality");
    expect(vdDepsType3.fields[1].slug).toBe("priority");

    // The updated node reflects new field value in view-data
    const vdApiGw3 = vd3.data.nodes.find((n) => n.id === serviceIds[0]);
    expect(vdApiGw3!.data.sla).toBe(99.99);

    // ------------------------------------------------------------------
    // Phase 7: Delete nodes → cascade edges → verify view-data
    // ------------------------------------------------------------------

    // Delete "Auth Service" — should cascade:
    //   depEdge[0] (API Gateway → Auth Service)
    //   readEdge[0] (Auth Service → Users DB)
    //   readEdge[1] (Auth Service → Cache)
    //   writeEdge[0] (Auth Service → Users DB)
    //   ownEdge[1] (Platform → Auth Service)
    const { status: delAuthStatus } = await del(`${g}/nodes/${serviceIds[1]}`);
    expect(delAuthStatus).toBe(204);

    const { body: vd4 } = await get<ViewData>(`${g}/view-data`);

    // Node count: was 10, -1 = 9
    expect(vd4.data.nodes).toHaveLength(9);
    expect(vd4.data.nodes.find((n) => n.id === serviceIds[1])).toBeUndefined();

    // Edge count: was 14, -5 = 9
    expect(vd4.data.edges).toHaveLength(9);

    // Verify specific cascaded edges are gone
    expect(vd4.data.edges.find((e) => e.id === depEdgeIds[0])).toBeUndefined();
    expect(vd4.data.edges.find((e) => e.id === readEdgeIds[0])).toBeUndefined();
    expect(vd4.data.edges.find((e) => e.id === readEdgeIds[1])).toBeUndefined();
    expect(vd4.data.edges.find((e) => e.id === writeEdgeIds[0])).toBeUndefined();
    expect(vd4.data.edges.find((e) => e.id === ownEdgeIds[1])).toBeUndefined();

    // Surviving edges are still correct
    const vd4DepEdges = vd4.data.edges.filter((e) => e.edge_type_id === depsTypeId);
    expect(vd4DepEdges).toHaveLength(3); // was 4, lost the API GW → Auth edge
    const vd4ReadEdges = vd4.data.edges.filter((e) => e.edge_type_id === readsTypeId);
    expect(vd4ReadEdges).toHaveLength(2); // Billing→Billing DB + Search→Cache
    const vd4WriteEdges = vd4.data.edges.filter((e) => e.edge_type_id === writesTypeId);
    expect(vd4WriteEdges).toHaveLength(1); // Billing→Billing DB
    const vd4OwnEdges = vd4.data.edges.filter((e) => e.edge_type_id === ownsTypeId);
    expect(vd4OwnEdges).toHaveLength(3); // was 4, lost Platform→Auth

    // Node types unchanged — deleting nodes doesn't affect types
    expect(vd4.data.node_types).toHaveLength(3);
    expect(vd4.data.edge_types).toHaveLength(4);

    // ------------------------------------------------------------------
    // Phase 8: Cross-graph isolation — second graph never leaks
    // ------------------------------------------------------------------

    const { body: graph2Body } = await post<Envelope<Graph>>(
      "/graphs",
      { name: "Isolated Graph", description: "Should not leak" },
    );
    const graph2Id = graph2Body.data.id;
    const g2 = `/graphs/${graph2Id}`;

    // Add a node type and node to graph 2
    const { body: g2Type } = await post<Envelope<NodeType>>(
      `${g2}/node-types`,
      { name: "Widget", color: "#FF0000", icon: "box" },
    );
    await post<Envelope<Field>>(
      `${g2}/node-types/${g2Type.data.id}/fields`,
      { name: "Label", field_type: "text", ordinal: 0, required: true },
    );
    await post<Envelope<Node>>(
      `${g2}/nodes`,
      { node_type_id: g2Type.data.id, data: { label: "Leaked?" } },
    );

    // Graph 1's view-data should be unchanged
    const { body: vd5 } = await get<ViewData>(`${g}/view-data`);
    expect(vd5.data.nodes).toHaveLength(9);
    expect(vd5.data.edges).toHaveLength(9);
    expect(vd5.data.node_types).toHaveLength(3);
    expect(vd5.data.edge_types).toHaveLength(4);
    // No nodes from graph 2
    expect(vd5.data.nodes.every((n) => n.graph_id === graphId)).toBe(true);
    expect(vd5.data.edges.every((e) => e.graph_id === graphId)).toBe(true);
    expect(vd5.data.node_types.every((t) => t.graph_id === graphId)).toBe(true);
    expect(vd5.data.edge_types.every((t) => t.graph_id === graphId)).toBe(true);

    // Graph 2's view-data should only have its own data
    const { body: vd2g } = await get<ViewData>(`${g2}/view-data`);
    expect(vd2g.data.nodes).toHaveLength(1);
    expect(vd2g.data.edges).toHaveLength(0);
    expect(vd2g.data.node_types).toHaveLength(1);
    expect(vd2g.data.node_types[0].name).toBe("Widget");
    expect(vd2g.data.nodes[0].data.label).toBe("Leaked?");
    expect(vd2g.data.nodes.every((n) => n.graph_id === graph2Id)).toBe(true);

    // ------------------------------------------------------------------
    // Phase 9: Cleanup + cascade verification
    // ------------------------------------------------------------------

    // Delete both graphs
    const { status: del1Status } = await del(`/graphs/${graphId}`);
    expect(del1Status).toBe(204);
    const { status: del2Status } = await del(`/graphs/${graph2Id}`);
    expect(del2Status).toBe(204);

    // Both gone
    const { status: gone1 } = await get(`/graphs/${graphId}`);
    expect(gone1).toBe(404);
    const { status: gone2 } = await get(`/graphs/${graph2Id}`);
    expect(gone2).toBe(404);

    // Verify cascade for graph 1
    const g1Nodes = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM nodes WHERE graph_id = ?",
    ).bind(graphId).first<{ cnt: number }>();
    expect(g1Nodes?.cnt).toBe(0);

    const g1Edges = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM edges WHERE graph_id = ?",
    ).bind(graphId).first<{ cnt: number }>();
    expect(g1Edges?.cnt).toBe(0);

    const g1NodeTypes = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM node_types WHERE graph_id = ?",
    ).bind(graphId).first<{ cnt: number }>();
    expect(g1NodeTypes?.cnt).toBe(0);

    const g1EdgeTypes = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM edge_types WHERE graph_id = ?",
    ).bind(graphId).first<{ cnt: number }>();
    expect(g1EdgeTypes?.cnt).toBe(0);

    // Verify cascade for graph 2
    const g2Nodes = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM nodes WHERE graph_id = ?",
    ).bind(graph2Id).first<{ cnt: number }>();
    expect(g2Nodes?.cnt).toBe(0);
  });
});

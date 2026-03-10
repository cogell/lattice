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

async function exportCsv(path: string): Promise<{ status: number; text: string }> {
  const res = await SELF.fetch(`${BASE}${path}`);
  return { status: res.status, text: await res.text() };
}

async function importCsv(
  path: string,
  csvText: string,
): Promise<{ status: number; body: unknown }> {
  const form = new FormData();
  form.append("file", new Blob([csvText], { type: "text/csv" }), "import.csv");
  const res = await SELF.fetch(`${BASE}${path}`, {
    method: "POST",
    body: form,
  });
  return { status: res.status, body: await res.json() };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Envelope<T> = { data: T };
type ListEnvelope<T> = { data: T[]; pagination: { total: number; limit: number; offset: number; has_more: boolean } };
type NodeType = { id: string; name: string; slug: string; display_field_slug: string | null };
type Field = { id: string; name: string; slug: string; field_type: string; ordinal: number; required: boolean };
type EdgeType = { id: string; name: string; slug: string; source_node_type_id: string; target_node_type_id: string };
type Node = { id: string; node_type_id: string; data: Record<string, unknown> };
type Edge = { id: string; edge_type_id: string; source_node_id: string; target_node_id: string; data: Record<string, unknown> };
type Graph = { id: string; name: string; description: string | null };

// ===========================================================================
// Multi-Type Data Pipeline with All Field Types
//
// Scenario: "Sprint Board"
//   Node types:
//     Task — every field type: text, number, boolean, date, url, email,
//            select, multi_select
//     Sprint — name (text), start_date (date), end_date (date)
//
//   Edge types:
//     depends_on — Task → Task (self-referential!) with dependency_type field
//     assigned_to — Task → Sprint with added_date field
//
// Phases:
//   1. Create graph + full schema (all 8 field types)
//   2. Populate data (tasks with all field types, sprints, edges)
//   3. Combined filter + sort + pagination queries
//   4. Edge filtering and sorting
//   5. Partial PATCH — update subset of fields
//   6. Delete a node → cascade to edges (both as source & target)
//   7. CSV export with all field types → verify serialization
//   8. Schema evolution: add a field, re-export → new column appears
//   9. CSV import with all field types → verify deserialization
//  10. Edge CSV export → import round-trip
//  11. CSV import validation — batch rejection on bad data
//  12. Final integrity check + cleanup
// ===========================================================================

describe("Multi-type data pipeline with all field types (e2e)", () => {
  it("exercises all field types, self-referential edges, cascade deletes, CSV round-trips, and combined queries", async () => {
    // ------------------------------------------------------------------
    // Phase 1: Create graph + full schema
    // ------------------------------------------------------------------
    const { status: graphStatus, body: graphBody } = await post<Envelope<Graph>>(
      "/graphs",
      { name: "Sprint Board", description: "Agile sprint tracker" },
    );
    expect(graphStatus).toBe(201);
    const graphId = graphBody.data.id;
    const g = `/graphs/${graphId}`;

    // -- Task node type (all 8 field types) --
    const { body: taskTypeBody } = await post<Envelope<NodeType>>(
      `${g}/node-types`,
      { name: "Task", color: "#EF4444", icon: "check-square" },
    );
    const taskTypeId = taskTypeBody.data.id;
    expect(taskTypeBody.data.slug).toBe("task");

    // text (required)
    const { body: titleField } = await post<Envelope<Field>>(
      `${g}/node-types/${taskTypeId}/fields`,
      { name: "Title", field_type: "text", ordinal: 0, required: true },
    );
    // number
    const { body: pointsField } = await post<Envelope<Field>>(
      `${g}/node-types/${taskTypeId}/fields`,
      { name: "Story Points", field_type: "number", ordinal: 1 },
    );
    // boolean
    const { body: completedField } = await post<Envelope<Field>>(
      `${g}/node-types/${taskTypeId}/fields`,
      { name: "Completed", field_type: "boolean", ordinal: 2 },
    );
    // date
    const { body: dueDateField } = await post<Envelope<Field>>(
      `${g}/node-types/${taskTypeId}/fields`,
      { name: "Due Date", field_type: "date", ordinal: 3 },
    );
    // url
    const { body: specUrlField } = await post<Envelope<Field>>(
      `${g}/node-types/${taskTypeId}/fields`,
      { name: "Spec URL", field_type: "url", ordinal: 4 },
    );
    // email
    const { body: ownerField } = await post<Envelope<Field>>(
      `${g}/node-types/${taskTypeId}/fields`,
      { name: "Owner Email", field_type: "email", ordinal: 5 },
    );
    // select
    const { body: priorityField } = await post<Envelope<Field>>(
      `${g}/node-types/${taskTypeId}/fields`,
      {
        name: "Priority",
        field_type: "select",
        ordinal: 6,
        config: { options: ["P0", "P1", "P2", "P3"] },
      },
    );
    // multi_select
    const { body: labelsField } = await post<Envelope<Field>>(
      `${g}/node-types/${taskTypeId}/fields`,
      {
        name: "Labels",
        field_type: "multi_select",
        ordinal: 7,
        config: { options: ["bug", "feature", "chore", "docs"] },
      },
    );

    // Verify all 8 fields created
    const { body: taskFields } = await get<{ data: Field[] }>(
      `${g}/node-types/${taskTypeId}/fields`,
    );
    expect(taskFields.data).toHaveLength(8);

    // -- Sprint node type --
    const { body: sprintTypeBody } = await post<Envelope<NodeType>>(
      `${g}/node-types`,
      { name: "Sprint", color: "#3B82F6", icon: "calendar" },
    );
    const sprintTypeId = sprintTypeBody.data.id;

    await post<Envelope<Field>>(
      `${g}/node-types/${sprintTypeId}/fields`,
      { name: "Name", field_type: "text", ordinal: 0, required: true },
    );
    await post<Envelope<Field>>(
      `${g}/node-types/${sprintTypeId}/fields`,
      { name: "Start Date", field_type: "date", ordinal: 1 },
    );
    await post<Envelope<Field>>(
      `${g}/node-types/${sprintTypeId}/fields`,
      { name: "End Date", field_type: "date", ordinal: 2 },
    );

    // -- Edge type: depends_on (Task → Task, SELF-REFERENTIAL) --
    const { body: depsBody } = await post<Envelope<EdgeType>>(
      `${g}/edge-types`,
      {
        name: "Depends On",
        source_node_type_id: taskTypeId,
        target_node_type_id: taskTypeId,
      },
    );
    const depsTypeId = depsBody.data.id;
    expect(depsBody.data.slug).toBe("depends_on");

    // Edge field: dependency_type (select)
    await post<Envelope<Field>>(
      `${g}/edge-types/${depsTypeId}/fields`,
      {
        name: "Dependency Type",
        field_type: "select",
        ordinal: 0,
        config: { options: ["blocks", "relates_to"] },
      },
    );

    // -- Edge type: assigned_to (Task → Sprint) --
    const { body: assignBody } = await post<Envelope<EdgeType>>(
      `${g}/edge-types`,
      {
        name: "Assigned To",
        source_node_type_id: taskTypeId,
        target_node_type_id: sprintTypeId,
      },
    );
    const assignTypeId = assignBody.data.id;

    await post<Envelope<Field>>(
      `${g}/edge-types/${assignTypeId}/fields`,
      { name: "Added Date", field_type: "date", ordinal: 0 },
    );

    // ------------------------------------------------------------------
    // Phase 2: Populate data
    // ------------------------------------------------------------------

    const tasks = [
      {
        title: "Implement auth",
        story_points: 8,
        completed: false,
        due_date: "2025-03-15",
        spec_url: "https://docs.example.com/auth",
        owner_email: "alice@team.io",
        priority: "P0",
        labels: ["feature"],
      },
      {
        title: "Fix login bug",
        story_points: 3,
        completed: true,
        due_date: "2025-03-10",
        spec_url: "https://bugs.example.com/123",
        owner_email: "bob@team.io",
        priority: "P1",
        labels: ["bug", "feature"],
      },
      {
        title: "Write API docs",
        story_points: 5,
        completed: false,
        due_date: "2025-03-20",
        spec_url: "https://docs.example.com/api",
        owner_email: "carol@team.io",
        priority: "P2",
        labels: ["docs"],
      },
      {
        title: "Refactor database",
        story_points: 13,
        completed: false,
        due_date: "2025-04-01",
        spec_url: "https://docs.example.com/db",
        owner_email: "alice@team.io",
        priority: "P1",
        labels: ["chore", "feature"],
      },
      {
        title: "Add monitoring",
        story_points: 5,
        completed: false,
        due_date: "2025-03-25",
        spec_url: "https://docs.example.com/monitoring",
        owner_email: "dave@team.io",
        priority: "P2",
        labels: ["feature", "chore"],
      },
    ];

    const taskIds: string[] = [];
    for (const t of tasks) {
      const { status, body } = await post<Envelope<Node>>(
        `${g}/nodes`,
        { node_type_id: taskTypeId, data: t },
      );
      expect(status).toBe(201);
      // Verify all field types stored correctly
      expect(body.data.data.title).toBe(t.title);
      expect(body.data.data.story_points).toBe(t.story_points);
      expect(body.data.data.completed).toBe(t.completed);
      expect(body.data.data.due_date).toBe(t.due_date);
      expect(body.data.data.spec_url).toBe(t.spec_url);
      expect(body.data.data.owner_email).toBe(t.owner_email);
      expect(body.data.data.priority).toBe(t.priority);
      expect(body.data.data.labels).toEqual(t.labels);
      taskIds.push(body.data.id);
    }

    // Sprints
    const sprints = [
      { name: "Sprint 1", start_date: "2025-03-01", end_date: "2025-03-14" },
      { name: "Sprint 2", start_date: "2025-03-15", end_date: "2025-03-28" },
    ];
    const sprintIds: string[] = [];
    for (const s of sprints) {
      const { status, body } = await post<Envelope<Node>>(
        `${g}/nodes`,
        { node_type_id: sprintTypeId, data: s },
      );
      expect(status).toBe(201);
      sprintIds.push(body.data.id);
    }

    // Self-referential edges: depends_on
    // "Fix login bug" blocks "Implement auth"
    // "Refactor database" blocks "Add monitoring"
    // "Implement auth" relates_to "Write API docs"
    const depEdges = [
      { src: taskIds[1], tgt: taskIds[0], dependency_type: "blocks" },
      { src: taskIds[3], tgt: taskIds[4], dependency_type: "blocks" },
      { src: taskIds[0], tgt: taskIds[2], dependency_type: "relates_to" },
    ];
    const depEdgeIds: string[] = [];
    for (const e of depEdges) {
      const { status, body } = await post<Envelope<Edge>>(
        `${g}/edges`,
        {
          edge_type_id: depsTypeId,
          source_node_id: e.src,
          target_node_id: e.tgt,
          data: { dependency_type: e.dependency_type },
        },
      );
      expect(status).toBe(201);
      depEdgeIds.push(body.data.id);
    }

    // assigned_to edges: tasks → sprints
    // Tasks 0,1 → Sprint 1; Tasks 2,3,4 → Sprint 2
    const assignEdges = [
      { src: taskIds[0], tgt: sprintIds[0], added_date: "2025-02-28" },
      { src: taskIds[1], tgt: sprintIds[0], added_date: "2025-02-28" },
      { src: taskIds[2], tgt: sprintIds[1], added_date: "2025-03-14" },
      { src: taskIds[3], tgt: sprintIds[1], added_date: "2025-03-14" },
      { src: taskIds[4], tgt: sprintIds[1], added_date: "2025-03-15" },
    ];
    const assignEdgeIds: string[] = [];
    for (const e of assignEdges) {
      const { status, body } = await post<Envelope<Edge>>(
        `${g}/edges`,
        {
          edge_type_id: assignTypeId,
          source_node_id: e.src,
          target_node_id: e.tgt,
          data: { added_date: e.added_date },
        },
      );
      expect(status).toBe(201);
      assignEdgeIds.push(body.data.id);
    }

    // Verify totals
    const { body: allNodes } = await get<ListEnvelope<Node>>(`${g}/nodes`);
    expect(allNodes.pagination.total).toBe(7); // 5 tasks + 2 sprints
    const { body: allEdges } = await get<ListEnvelope<Edge>>(`${g}/edges`);
    expect(allEdges.pagination.total).toBe(8); // 3 depends_on + 5 assigned_to

    // ------------------------------------------------------------------
    // Phase 3: Combined filter + sort + pagination on nodes
    // ------------------------------------------------------------------

    // Filter tasks by priority=P1, sorted by story_points desc
    const { body: p1Tasks } = await get<ListEnvelope<Node>>(
      `${g}/nodes?type=${taskTypeId}&filter[priority][eq]=P1&sort=story_points:desc`,
    );
    expect(p1Tasks.data).toHaveLength(2);
    // "Refactor database" (13 pts) should come before "Fix login bug" (3 pts)
    expect(p1Tasks.data[0].data.title).toBe("Refactor database");
    expect(p1Tasks.data[1].data.title).toBe("Fix login bug");

    // Filter by completed=true (boolean filter)
    const { body: completedTasks } = await get<ListEnvelope<Node>>(
      `${g}/nodes?type=${taskTypeId}&filter[completed][eq]=true`,
    );
    expect(completedTasks.data).toHaveLength(1);
    expect(completedTasks.data[0].data.title).toBe("Fix login bug");

    // Filter by owner_email with eq (contains only works on text fields)
    const { body: aliceTasks } = await get<ListEnvelope<Node>>(
      `${g}/nodes?type=${taskTypeId}&filter[owner_email][eq]=alice@team.io`,
    );
    expect(aliceTasks.data).toHaveLength(2);
    const aliceNames = aliceTasks.data.map((n) => n.data.title).sort();
    expect(aliceNames).toEqual(["Implement auth", "Refactor database"]);

    // Paginate with filter: P2 tasks, limit 1, verify has_more
    const { body: p2Page1 } = await get<ListEnvelope<Node>>(
      `${g}/nodes?type=${taskTypeId}&filter[priority][eq]=P2&sort=title:asc&limit=1&offset=0`,
    );
    expect(p2Page1.data).toHaveLength(1);
    expect(p2Page1.pagination.total).toBe(2);
    expect(p2Page1.pagination.has_more).toBe(true);
    expect(p2Page1.data[0].data.title).toBe("Add monitoring");

    const { body: p2Page2 } = await get<ListEnvelope<Node>>(
      `${g}/nodes?type=${taskTypeId}&filter[priority][eq]=P2&sort=title:asc&limit=1&offset=1`,
    );
    expect(p2Page2.data).toHaveLength(1);
    expect(p2Page2.pagination.has_more).toBe(false);
    expect(p2Page2.data[0].data.title).toBe("Write API docs");

    // Sort by due_date ascending
    const { body: byDueDate } = await get<ListEnvelope<Node>>(
      `${g}/nodes?type=${taskTypeId}&sort=due_date:asc`,
    );
    expect(byDueDate.data[0].data.title).toBe("Fix login bug"); // 2025-03-10
    expect(byDueDate.data[4].data.title).toBe("Refactor database"); // 2025-04-01

    // ------------------------------------------------------------------
    // Phase 4: Edge filtering and sorting
    // ------------------------------------------------------------------

    // Filter depends_on edges by dependency_type
    const { body: blockingEdges } = await get<ListEnvelope<Edge>>(
      `${g}/edges?type=${depsTypeId}&filter[dependency_type][eq]=blocks`,
    );
    expect(blockingEdges.data).toHaveLength(2);

    const { body: relatesEdges } = await get<ListEnvelope<Edge>>(
      `${g}/edges?type=${depsTypeId}&filter[dependency_type][eq]=relates_to`,
    );
    expect(relatesEdges.data).toHaveLength(1);
    expect(relatesEdges.data[0].source_node_id).toBe(taskIds[0]);
    expect(relatesEdges.data[0].target_node_id).toBe(taskIds[2]);

    // Sort assigned_to edges by added_date ascending
    const { body: sortedAssigns } = await get<ListEnvelope<Edge>>(
      `${g}/edges?type=${assignTypeId}&sort=added_date:asc`,
    );
    expect(sortedAssigns.data).toHaveLength(5);
    expect(sortedAssigns.data[0].data.added_date).toBe("2025-02-28");
    expect(sortedAssigns.data[4].data.added_date).toBe("2025-03-15");

    // ------------------------------------------------------------------
    // Phase 5: Partial PATCH — update only some fields
    // ------------------------------------------------------------------

    // Update task[0] ("Implement auth"): only change story_points and completed
    const { status: patchStatus, body: patchBody } = await patch<Envelope<Node>>(
      `${g}/nodes/${taskIds[0]}`,
      { data: { title: "Implement auth", story_points: 13, completed: true } },
    );
    expect(patchStatus).toBe(200);
    expect(patchBody.data.data.story_points).toBe(13);
    expect(patchBody.data.data.completed).toBe(true);
    // Other fields should still be present
    expect(patchBody.data.data.due_date).toBe("2025-03-15");
    expect(patchBody.data.data.owner_email).toBe("alice@team.io");
    expect(patchBody.data.data.priority).toBe("P0");
    expect(patchBody.data.data.labels).toEqual(["feature"]);

    // ------------------------------------------------------------------
    // Phase 6: Delete a node → cascade to edges (source AND target)
    // ------------------------------------------------------------------

    // Task[0] ("Implement auth") is:
    //   - TARGET of depEdge[0] (Fix login bug → Implement auth)
    //   - SOURCE of depEdge[2] (Implement auth → Write API docs)
    //   - SOURCE of assignEdge[0] (Implement auth → Sprint 1)
    // Deleting it should cascade-delete all 3 edges

    const { status: delTaskStatus } = await del(`${g}/nodes/${taskIds[0]}`);
    expect(delTaskStatus).toBe(204);

    // Verify the node is gone
    const { status: taskGone } = await get(`${g}/nodes/${taskIds[0]}`);
    expect(taskGone).toBe(404);

    // Verify edges referencing deleted node are gone
    const { status: dep0Gone } = await get(`${g}/edges/${depEdgeIds[0]}`);
    expect(dep0Gone).toBe(404);
    const { status: dep2Gone } = await get(`${g}/edges/${depEdgeIds[2]}`);
    expect(dep2Gone).toBe(404);
    const { status: assign0Gone } = await get(`${g}/edges/${assignEdgeIds[0]}`);
    expect(assign0Gone).toBe(404);

    // Edges NOT referencing deleted node should still exist
    const { body: dep1Check } = await get<Envelope<Edge>>(`${g}/edges/${depEdgeIds[1]}`);
    expect(dep1Check.data.id).toBe(depEdgeIds[1]); // Refactor DB → Add monitoring
    const { body: assign1Check } = await get<Envelope<Edge>>(`${g}/edges/${assignEdgeIds[1]}`);
    expect(assign1Check.data.id).toBe(assignEdgeIds[1]); // Fix login bug → Sprint 1

    // Updated totals
    const { body: afterDeleteNodes } = await get<ListEnvelope<Node>>(`${g}/nodes`);
    expect(afterDeleteNodes.pagination.total).toBe(6); // was 7, deleted 1
    const { body: afterDeleteEdges } = await get<ListEnvelope<Edge>>(`${g}/edges`);
    expect(afterDeleteEdges.pagination.total).toBe(5); // was 8, deleted 3

    // ------------------------------------------------------------------
    // Phase 7: CSV export with all field types
    // ------------------------------------------------------------------

    const { status: csvStatus, text: csvText } = await exportCsv(
      `${g}/nodes/export?type=${taskTypeId}`,
    );
    expect(csvStatus).toBe(200);

    const csvLines = csvText.trim().split(/\r?\n/);
    const headers = csvLines[0];

    // All field-name headers should be present
    expect(headers).toContain("Title");
    expect(headers).toContain("Story Points");
    expect(headers).toContain("Completed");
    expect(headers).toContain("Due Date");
    expect(headers).toContain("Spec URL");
    expect(headers).toContain("Owner Email");
    expect(headers).toContain("Priority");
    expect(headers).toContain("Labels");

    // 4 remaining tasks + 1 header = 5 lines
    expect(csvLines).toHaveLength(5);

    // Verify specific values serialize correctly
    expect(csvText).toContain("Fix login bug");
    expect(csvText).toContain("bob@team.io");
    expect(csvText).toContain("2025-03-10");
    expect(csvText).toContain("https://bugs.example.com/123");
    // Boolean should serialize
    expect(csvText).toContain("true");
    expect(csvText).toContain("false");

    // ------------------------------------------------------------------
    // Phase 8: Schema evolution — add a field, re-export
    // ------------------------------------------------------------------

    // Add "Estimate Confidence" (number) field to Task
    const { status: newFieldStatus } = await post<Envelope<Field>>(
      `${g}/node-types/${taskTypeId}/fields`,
      { name: "Estimate Confidence", field_type: "number", ordinal: 8 },
    );
    expect(newFieldStatus).toBe(201);

    // Re-export — new column should appear in headers
    const { text: csvAfterEvolution } = await exportCsv(
      `${g}/nodes/export?type=${taskTypeId}`,
    );
    const evolvedHeaders = csvAfterEvolution.trim().split(/\r?\n/)[0];
    expect(evolvedHeaders).toContain("Estimate Confidence");
    // Existing data should still be there
    expect(csvAfterEvolution).toContain("Fix login bug");

    // ------------------------------------------------------------------
    // Phase 9: CSV import with all field types
    // ------------------------------------------------------------------

    // Build a CSV with all field types including the new field
    // Note: multi_select uses pipe (|) separator in CSV
    const importData = [
      "Title,Story Points,Completed,Due Date,Spec URL,Owner Email,Priority,Labels,Estimate Confidence",
      "New task via CSV,8,false,2025-04-15,https://example.com/new,eve@team.io,P0,feature|docs,90",
      "Another CSV task,3,true,2025-04-10,https://example.com/other,frank@team.io,P3,chore,75",
    ].join("\n");

    const { status: impStatus, body: impBody } = await importCsv(
      `${g}/nodes/import?type=${taskTypeId}`,
      importData,
    );
    expect(impStatus).toBe(201);
    expect((impBody as { data: { imported: number } }).data.imported).toBe(2);

    // Verify imported nodes have correct data
    const { body: importedNodes } = await get<ListEnvelope<Node>>(
      `${g}/nodes?type=${taskTypeId}&sort=title:asc`,
    );
    expect(importedNodes.pagination.total).toBe(6); // 4 remaining + 2 imported

    const csvTask = importedNodes.data.find((n) => n.data.title === "New task via CSV");
    expect(csvTask).toBeDefined();
    expect(csvTask!.data.story_points).toBe(8);
    expect(csvTask!.data.completed).toBe(false);
    expect(csvTask!.data.due_date).toBe("2025-04-15");
    expect(csvTask!.data.spec_url).toBe("https://example.com/new");
    expect(csvTask!.data.owner_email).toBe("eve@team.io");
    expect(csvTask!.data.priority).toBe("P0");
    expect(csvTask!.data.labels).toEqual(["feature", "docs"]);
    expect(csvTask!.data.estimate_confidence).toBe(90);

    const anotherTask = importedNodes.data.find((n) => n.data.title === "Another CSV task");
    expect(anotherTask).toBeDefined();
    expect(anotherTask!.data.completed).toBe(true);
    expect(anotherTask!.data.labels).toEqual(["chore"]);
    expect(anotherTask!.data.estimate_confidence).toBe(75);

    // ------------------------------------------------------------------
    // Phase 10: Edge CSV export → import round-trip
    // ------------------------------------------------------------------

    // Export depends_on edges
    const { status: edgeCsvStatus, text: edgeCsvText } = await exportCsv(
      `${g}/edges/export?type=${depsTypeId}`,
    );
    expect(edgeCsvStatus).toBe(200);
    const edgeCsvLines = edgeCsvText.trim().split(/\r?\n/);

    // Should have header + 1 remaining depends_on edge (2 were deleted in cascade)
    expect(edgeCsvLines[0]).toContain("source_node_id");
    expect(edgeCsvLines[0]).toContain("target_node_id");
    expect(edgeCsvLines[0]).toContain("Dependency Type");
    expect(edgeCsvLines).toHaveLength(2); // header + 1 edge

    // Strip id column for re-import
    const edgeHeaderCols = edgeCsvLines[0].split(",");
    const edgeIdIdx = edgeHeaderCols.indexOf("id");
    const edgeImportLines = edgeCsvLines.map((line) => {
      const cols = line.replace(/\r$/, "").split(",");
      cols.splice(edgeIdIdx, 1);
      return cols.join(",");
    });
    const edgeImportCsv = edgeImportLines.join("\n");

    // Import — should create 1 new edge
    const { status: edgeImpStatus, body: edgeImpBody } = await importCsv(
      `${g}/edges/import?type=${depsTypeId}`,
      edgeImportCsv,
    );
    expect(edgeImpStatus).toBe(201);
    expect((edgeImpBody as { data: { imported: number } }).data.imported).toBe(1);

    // Now 2 depends_on edges (1 original + 1 imported)
    const { body: depsAfterImport } = await get<ListEnvelope<Edge>>(
      `${g}/edges?type=${depsTypeId}`,
    );
    expect(depsAfterImport.pagination.total).toBe(2);

    // ------------------------------------------------------------------
    // Phase 11: CSV import validation — batch rejection
    // ------------------------------------------------------------------

    // Missing required field (title), invalid select option, bad email format
    const badCsv = [
      "Title,Story Points,Completed,Due Date,Spec URL,Owner Email,Priority,Labels,Estimate Confidence",
      ",5,false,2025-05-01,https://example.com,good@email.io,P0,feature,50",
    ].join("\n");

    const { status: badImpStatus, body: badImpBody } = await importCsv(
      `${g}/nodes/import?type=${taskTypeId}`,
      badCsv,
    );
    expect(badImpStatus).toBe(400);
    // The batch should be fully rejected — verify count unchanged
    const { body: afterBadImport } = await get<ListEnvelope<Node>>(
      `${g}/nodes?type=${taskTypeId}`,
    );
    expect(afterBadImport.pagination.total).toBe(6); // unchanged from Phase 9

    // Edge type constraint violation: try to create Sprint → Sprint edge
    // using depends_on (which expects Task → Task)
    const badEdgeCsv = [
      "source_node_id,target_node_id,Dependency Type",
      `${sprintIds[0]},${sprintIds[1]},blocks`,
    ].join("\n");

    const { status: badEdgeImpStatus } = await importCsv(
      `${g}/edges/import?type=${depsTypeId}`,
      badEdgeCsv,
    );
    expect(badEdgeImpStatus).toBe(400);

    // ------------------------------------------------------------------
    // Phase 12: Final integrity check + cleanup
    // ------------------------------------------------------------------

    // Node types: Task, Sprint
    const { body: finalTypes } = await get<{ data: NodeType[] }>(`${g}/node-types`);
    expect(finalTypes.data).toHaveLength(2);

    // Edge types: depends_on, assigned_to
    const { body: finalEdgeTypes } = await get<{ data: EdgeType[] }>(`${g}/edge-types`);
    expect(finalEdgeTypes.data).toHaveLength(2);

    // Nodes: 6 tasks + 2 sprints = 8
    const { body: finalNodes } = await get<ListEnvelope<Node>>(`${g}/nodes`);
    expect(finalNodes.pagination.total).toBe(8);

    // Edges: 2 depends_on + 4 assigned_to = 6
    const { body: finalEdges } = await get<ListEnvelope<Edge>>(`${g}/edges`);
    expect(finalEdges.pagination.total).toBe(6);

    // Spot-check data integrity on a node that survived everything
    const { body: loginBug } = await get<Envelope<Node>>(`${g}/nodes/${taskIds[1]}`);
    expect(loginBug.data.data.title).toBe("Fix login bug");
    expect(loginBug.data.data.story_points).toBe(3);
    expect(loginBug.data.data.completed).toBe(true);
    expect(loginBug.data.data.due_date).toBe("2025-03-10");
    expect(loginBug.data.data.spec_url).toBe("https://bugs.example.com/123");
    expect(loginBug.data.data.owner_email).toBe("bob@team.io");
    expect(loginBug.data.data.priority).toBe("P1");
    expect(loginBug.data.data.labels).toEqual(["bug", "feature"]);

    // Cleanup: delete graph
    const { status: cleanupStatus } = await del(`/graphs/${graphId}`);
    expect(cleanupStatus).toBe(204);

    // Verify cascade cleaned everything
    const dbNodes = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM nodes WHERE graph_id = ?",
    ).bind(graphId).first<{ cnt: number }>();
    expect(dbNodes?.cnt).toBe(0);

    const dbEdges = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM edges WHERE graph_id = ?",
    ).bind(graphId).first<{ cnt: number }>();
    expect(dbEdges?.cnt).toBe(0);
  });
});

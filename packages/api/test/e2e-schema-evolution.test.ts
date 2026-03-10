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
// Schema Evolution Under Live Data
//
// Scenario: "Research Lab Knowledge Graph"
//   Build a graph with Researcher + Paper + Project node types and edges,
//   populate it with data, then evolve the schema — add fields, delete
//   fields (verifying data pruning), reorder fields, set & nullify
//   display_field_slug, enforce "cannot make required with existing data",
//   delete an entire node type (cascade to nodes + edges), add a new edge
//   type with constraints, and verify data integrity throughout.
//
// Phases:
//   1. Create graph + initial schema (Researcher, Paper)
//   2. Populate with data (3 researchers, 2 papers, edges)
//   3. Evolve schema — add fields to existing types
//   4. Set display_field_slug, then delete that field → verify nullification
//   5. Delete a field → verify data pruned from all nodes
//   6. Attempt to make a field required with existing data → expect 400
//   7. Reorder fields → verify ordinals
//   8. Add a third node type (Project) + constrained edge type
//   9. Delete the Paper node type → cascade removes nodes + connected edges
//  10. Verify final graph integrity — remaining data is consistent
//  11. CSV export reflects evolved schema
// ===========================================================================

describe("Schema evolution under live data (e2e)", () => {
  it("evolves schema while preserving data integrity across additions, deletions, and cascades", async () => {
    // ------------------------------------------------------------------
    // Phase 1: Create graph + initial schema
    // ------------------------------------------------------------------
    const { status: graphStatus, body: graphBody } = await post<Envelope<Graph>>(
      "/graphs",
      { name: "Research Lab", description: "Academic knowledge graph" },
    );
    expect(graphStatus).toBe(201);
    const graphId = graphBody.data.id;
    const g = `/graphs/${graphId}`;

    // -- Researcher node type --
    const { body: researcherBody } = await post<Envelope<NodeType>>(
      `${g}/node-types`,
      { name: "Researcher", color: "#3B82F6", icon: "user" },
    );
    const researcherTypeId = researcherBody.data.id;
    expect(researcherBody.data.slug).toBe("researcher");

    // Fields: name (text, required), email (email), h_index (number)
    const { body: nameField } = await post<Envelope<Field>>(
      `${g}/node-types/${researcherTypeId}/fields`,
      { name: "Name", field_type: "text", ordinal: 0, required: true },
    );
    const { body: emailField } = await post<Envelope<Field>>(
      `${g}/node-types/${researcherTypeId}/fields`,
      { name: "Email", field_type: "email", ordinal: 1 },
    );
    const { body: hIndexField } = await post<Envelope<Field>>(
      `${g}/node-types/${researcherTypeId}/fields`,
      { name: "H-Index", field_type: "number", ordinal: 2 },
    );

    // -- Paper node type --
    const { body: paperBody } = await post<Envelope<NodeType>>(
      `${g}/node-types`,
      { name: "Paper", color: "#F59E0B", icon: "file-text" },
    );
    const paperTypeId = paperBody.data.id;

    // Fields: title (text, required), abstract (text), year (number), status (select)
    const { body: titleField } = await post<Envelope<Field>>(
      `${g}/node-types/${paperTypeId}/fields`,
      { name: "Title", field_type: "text", ordinal: 0, required: true },
    );
    const { body: abstractField } = await post<Envelope<Field>>(
      `${g}/node-types/${paperTypeId}/fields`,
      { name: "Abstract", field_type: "text", ordinal: 1 },
    );
    const { body: yearField } = await post<Envelope<Field>>(
      `${g}/node-types/${paperTypeId}/fields`,
      { name: "Year", field_type: "number", ordinal: 2 },
    );
    const { body: statusField } = await post<Envelope<Field>>(
      `${g}/node-types/${paperTypeId}/fields`,
      {
        name: "Status",
        field_type: "select",
        ordinal: 3,
        config: { options: ["Draft", "Submitted", "Published"] },
      },
    );

    // -- Edge type: authored (Researcher → Paper) --
    const { body: authoredBody } = await post<Envelope<EdgeType>>(
      `${g}/edge-types`,
      {
        name: "Authored",
        source_node_type_id: researcherTypeId,
        target_node_type_id: paperTypeId,
      },
    );
    const authoredTypeId = authoredBody.data.id;

    // Edge field: contribution (select)
    await post<Envelope<Field>>(
      `${g}/edge-types/${authoredTypeId}/fields`,
      {
        name: "Contribution",
        field_type: "select",
        ordinal: 0,
        config: { options: ["Lead", "Co-author", "Advisor"] },
      },
    );

    // ------------------------------------------------------------------
    // Phase 2: Populate with data
    // ------------------------------------------------------------------

    // 3 researchers
    const researchers = [
      { name: "Dr. Alice Chen", email: "alice@lab.edu", h_index: 42 },
      { name: "Dr. Bob Kim", email: "bob@lab.edu", h_index: 28 },
      { name: "Dr. Carol Liu", email: "carol@lab.edu", h_index: 35 },
    ];
    const researcherIds: string[] = [];
    for (const r of researchers) {
      const { status, body } = await post<Envelope<Node>>(
        `${g}/nodes`,
        { node_type_id: researcherTypeId, data: r },
      );
      expect(status).toBe(201);
      researcherIds.push(body.data.id);
    }

    // 2 papers
    const papers = [
      { title: "Graph Neural Networks", abstract: "A survey of GNNs", year: 2024, status: "Published" },
      { title: "Schema Evolution", abstract: "Handling schema changes", year: 2025, status: "Draft" },
    ];
    const paperIds: string[] = [];
    for (const p of papers) {
      const { status, body } = await post<Envelope<Node>>(
        `${g}/nodes`,
        { node_type_id: paperTypeId, data: p },
      );
      expect(status).toBe(201);
      paperIds.push(body.data.id);
    }

    // Edges: Alice authored both papers, Bob co-authored paper 1
    const edgePairs = [
      { src: researcherIds[0], tgt: paperIds[0], contribution: "Lead" },
      { src: researcherIds[0], tgt: paperIds[1], contribution: "Lead" },
      { src: researcherIds[1], tgt: paperIds[0], contribution: "Co-author" },
    ];
    const edgeIds: string[] = [];
    for (const e of edgePairs) {
      const { status, body } = await post<Envelope<Edge>>(
        `${g}/edges`,
        {
          edge_type_id: authoredTypeId,
          source_node_id: e.src,
          target_node_id: e.tgt,
          data: { contribution: e.contribution },
        },
      );
      expect(status).toBe(201);
      edgeIds.push(body.data.id);
    }

    // Verify baseline counts
    const { body: baseNodes } = await get<ListEnvelope<Node>>(`${g}/nodes`);
    expect(baseNodes.pagination.total).toBe(5); // 3 researchers + 2 papers
    const { body: baseEdges } = await get<ListEnvelope<Edge>>(`${g}/edges`);
    expect(baseEdges.pagination.total).toBe(3);

    // ------------------------------------------------------------------
    // Phase 3: Evolve schema — add new fields to existing types
    // ------------------------------------------------------------------

    // Add "Website" (url) and "Department" (select) fields to Researcher
    const { status: websiteStatus, body: websiteField } = await post<Envelope<Field>>(
      `${g}/node-types/${researcherTypeId}/fields`,
      { name: "Website", field_type: "url", ordinal: 3 },
    );
    expect(websiteStatus).toBe(201);
    expect(websiteField.data.slug).toBe("website");

    const { body: deptField } = await post<Envelope<Field>>(
      `${g}/node-types/${researcherTypeId}/fields`,
      {
        name: "Department",
        field_type: "select",
        ordinal: 4,
        config: { options: ["CS", "Math", "Physics"] },
      },
    );

    // Existing researchers should still be readable (new fields are just absent/null in data)
    const { body: aliceNode } = await get<Envelope<Node>>(`${g}/nodes/${researcherIds[0]}`);
    expect(aliceNode.data.data.name).toBe("Dr. Alice Chen");
    expect(aliceNode.data.data.website).toBeUndefined(); // new field not yet populated

    // Update Alice with the new fields
    const { status: updateStatus, body: updatedAlice } = await patch<Envelope<Node>>(
      `${g}/nodes/${researcherIds[0]}`,
      { data: { ...aliceNode.data.data, website: "https://alice.lab.edu", department: "CS" } },
    );
    expect(updateStatus).toBe(200);
    expect(updatedAlice.data.data.website).toBe("https://alice.lab.edu");
    expect(updatedAlice.data.data.department).toBe("CS");

    // Verify field count grew
    const { body: researcherFields } = await get<{ data: Field[] }>(
      `${g}/node-types/${researcherTypeId}/fields`,
    );
    expect(researcherFields.data).toHaveLength(5); // name, email, h_index, website, department

    // ------------------------------------------------------------------
    // Phase 4: Set display_field_slug, then delete that field → nullified
    // ------------------------------------------------------------------

    // Set display_field_slug to "email"
    const { status: dfsStatus, body: dfsBody } = await patch<Envelope<NodeType>>(
      `${g}/node-types/${researcherTypeId}`,
      { display_field_slug: "email" },
    );
    expect(dfsStatus).toBe(200);
    expect(dfsBody.data.display_field_slug).toBe("email");

    // Delete the email field
    const { status: delEmailStatus } = await del(
      `${g}/node-types/${researcherTypeId}/fields/${emailField.data.id}`,
    );
    expect(delEmailStatus).toBe(204);

    // Verify display_field_slug was nullified
    const { body: afterEmailDelete } = await get<Envelope<NodeType>>(
      `${g}/node-types/${researcherTypeId}`,
    );
    expect(afterEmailDelete.data.display_field_slug).toBeNull();

    // Verify email data was pruned from ALL researcher nodes
    for (const id of researcherIds) {
      const { body: node } = await get<Envelope<Node>>(`${g}/nodes/${id}`);
      expect(node.data.data.email).toBeUndefined();
      // Other fields should still be intact
      expect(node.data.data.name).toBeDefined();
      expect(node.data.data.h_index).toBeDefined();
    }

    // Remaining fields: name, h_index, website, department (4 total)
    const { body: fieldsAfterDelete } = await get<{ data: Field[] }>(
      `${g}/node-types/${researcherTypeId}/fields`,
    );
    expect(fieldsAfterDelete.data).toHaveLength(4);
    expect(fieldsAfterDelete.data.map((f) => f.slug).sort()).toEqual(
      ["department", "h_index", "name", "website"],
    );

    // ------------------------------------------------------------------
    // Phase 5: Delete another field → verify data pruning on Papers
    // ------------------------------------------------------------------

    // Delete the "Abstract" field from Paper
    const { status: delAbstractStatus } = await del(
      `${g}/node-types/${paperTypeId}/fields/${abstractField.data.id}`,
    );
    expect(delAbstractStatus).toBe(204);

    // Verify abstract pruned from paper nodes, title still there
    for (const id of paperIds) {
      const { body: paper } = await get<Envelope<Node>>(`${g}/nodes/${id}`);
      expect(paper.data.data.abstract).toBeUndefined();
      expect(paper.data.data.title).toBeDefined();
      expect(paper.data.data.year).toBeDefined();
    }

    // ------------------------------------------------------------------
    // Phase 6: Attempt to make a field required when nodes exist → 400
    // ------------------------------------------------------------------

    const { status: makeRequiredStatus, body: makeRequiredBody } = await patch<{ error: { message: string } }>(
      `${g}/node-types/${researcherTypeId}/fields/${websiteField.data.id}`,
      { required: true },
    );
    expect(makeRequiredStatus).toBe(400);
    expect((makeRequiredBody as { error: { message: string } }).error.message).toContain(
      "Cannot make field required when nodes of this type exist",
    );

    // ------------------------------------------------------------------
    // Phase 7: Reorder fields → verify ordinals
    // ------------------------------------------------------------------

    // Move h_index to ordinal 0 (before name) and name to ordinal 1
    await patch<Envelope<Field>>(
      `${g}/node-types/${researcherTypeId}/fields/${hIndexField.data.id}`,
      { ordinal: 0 },
    );
    await patch<Envelope<Field>>(
      `${g}/node-types/${researcherTypeId}/fields/${nameField.data.id}`,
      { ordinal: 1 },
    );

    // Verify fields come back in new ordinal order
    const { body: reorderedFields } = await get<{ data: Field[] }>(
      `${g}/node-types/${researcherTypeId}/fields`,
    );
    expect(reorderedFields.data[0].slug).toBe("h_index");
    expect(reorderedFields.data[0].ordinal).toBe(0);
    expect(reorderedFields.data[1].slug).toBe("name");
    expect(reorderedFields.data[1].ordinal).toBe(1);

    // ------------------------------------------------------------------
    // Phase 8: Add third node type (Project) + new edge type with constraints
    // ------------------------------------------------------------------

    const { body: projectBody } = await post<Envelope<NodeType>>(
      `${g}/node-types`,
      { name: "Project", color: "#10B981" },
    );
    const projectTypeId = projectBody.data.id;

    await post<Envelope<Field>>(
      `${g}/node-types/${projectTypeId}/fields`,
      { name: "Name", field_type: "text", ordinal: 0, required: true },
    );
    await post<Envelope<Field>>(
      `${g}/node-types/${projectTypeId}/fields`,
      { name: "Funding", field_type: "number", ordinal: 1 },
    );

    // Create a project node
    const { body: projectNode } = await post<Envelope<Node>>(
      `${g}/nodes`,
      { node_type_id: projectTypeId, data: { name: "Graph Research Initiative", funding: 500000 } },
    );
    const projectNodeId = projectNode.data.id;

    // Edge type: "works_on" (Researcher → Project)
    const { body: worksOnBody } = await post<Envelope<EdgeType>>(
      `${g}/edge-types`,
      {
        name: "Works On",
        source_node_type_id: researcherTypeId,
        target_node_type_id: projectTypeId,
      },
    );
    const worksOnTypeId = worksOnBody.data.id;

    // Connect Alice to the project
    const { status: worksOnEdgeStatus } = await post<Envelope<Edge>>(
      `${g}/edges`,
      {
        edge_type_id: worksOnTypeId,
        source_node_id: researcherIds[0],
        target_node_id: projectNodeId,
        data: {},
      },
    );
    expect(worksOnEdgeStatus).toBe(201);

    // Constraint enforcement: trying to connect Paper → Project should fail
    // (source must be Researcher, not Paper)
    const { status: badEdgeStatus } = await post<{ error: { message: string } }>(
      `${g}/edges`,
      {
        edge_type_id: worksOnTypeId,
        source_node_id: paperIds[0],
        target_node_id: projectNodeId,
        data: {},
      },
    );
    expect(badEdgeStatus).toBe(400);

    // Verify total counts at this point
    const { body: midNodes } = await get<ListEnvelope<Node>>(`${g}/nodes`);
    expect(midNodes.pagination.total).toBe(6); // 3 researchers + 2 papers + 1 project
    const { body: midEdges } = await get<ListEnvelope<Edge>>(`${g}/edges`);
    expect(midEdges.pagination.total).toBe(4); // 3 authored + 1 works_on

    // ------------------------------------------------------------------
    // Phase 9: Delete Paper node type → cascade to nodes + edges
    // ------------------------------------------------------------------

    // Paper nodes are targets of "authored" edges, so deleting Paper type
    // should cascade: Paper nodes deleted → authored edges (which reference
    // those nodes) deleted → authored edge type stays but has no instances.

    const { status: delPaperStatus } = await del(`${g}/node-types/${paperTypeId}`);
    expect(delPaperStatus).toBe(204);

    // Paper type is gone
    const { status: paperGoneStatus } = await get(`${g}/node-types/${paperTypeId}`);
    expect(paperGoneStatus).toBe(404);

    // Paper nodes are gone
    for (const id of paperIds) {
      const { status } = await get(`${g}/nodes/${id}`);
      expect(status).toBe(404);
    }

    // Authored edges should be gone (FK CASCADE through paper nodes)
    for (const id of edgeIds) {
      const { status } = await get(`${g}/edges/${id}`);
      expect(status).toBe(404);
    }

    // The "authored" edge type should also be gone (CASCADE through node_types
    // since it references paperTypeId as target_node_type_id)
    const { status: authoredTypeGone } = await get(`${g}/edge-types/${authoredTypeId}`);
    expect(authoredTypeGone).toBe(404);

    // But "works_on" edge type should still exist (it uses researcher + project)
    const { body: worksOnCheck } = await get<Envelope<EdgeType>>(`${g}/edge-types/${worksOnTypeId}`);
    expect(worksOnCheck.data.id).toBe(worksOnTypeId);

    // ------------------------------------------------------------------
    // Phase 10: Verify final graph integrity
    // ------------------------------------------------------------------

    // Remaining node types: Researcher, Project
    const { body: finalNodeTypes } = await get<{ data: NodeType[] }>(`${g}/node-types`);
    expect(finalNodeTypes.data).toHaveLength(2);
    const typeNames = finalNodeTypes.data.map((t) => t.name).sort();
    expect(typeNames).toEqual(["Project", "Researcher"]);

    // Remaining edge types: works_on only
    const { body: finalEdgeTypes } = await get<{ data: EdgeType[] }>(`${g}/edge-types`);
    expect(finalEdgeTypes.data).toHaveLength(1);
    expect(finalEdgeTypes.data[0].name).toBe("Works On");

    // Remaining nodes: 3 researchers + 1 project = 4
    const { body: finalNodes } = await get<ListEnvelope<Node>>(`${g}/nodes`);
    expect(finalNodes.pagination.total).toBe(4);

    // Remaining edges: 1 works_on edge
    const { body: finalEdges } = await get<ListEnvelope<Edge>>(`${g}/edges`);
    expect(finalEdges.pagination.total).toBe(1);

    // Verify researcher data integrity after all schema changes
    const { body: finalAlice } = await get<Envelope<Node>>(`${g}/nodes/${researcherIds[0]}`);
    expect(finalAlice.data.data.name).toBe("Dr. Alice Chen");
    expect(finalAlice.data.data.h_index).toBe(42);
    expect(finalAlice.data.data.website).toBe("https://alice.lab.edu");
    expect(finalAlice.data.data.department).toBe("CS");
    expect(finalAlice.data.data.email).toBeUndefined(); // pruned in Phase 4

    // ------------------------------------------------------------------
    // Phase 11: CSV export reflects evolved schema
    // ------------------------------------------------------------------

    // Export researchers — should have evolved field set (no email, has website/department)
    const { status: csvStatus, text: csvText } = await exportCsv(
      `${g}/nodes/export?type=${researcherTypeId}`,
    );
    expect(csvStatus).toBe(200);

    // Headers should reflect current fields (email gone, website/department present)
    const headerLine = csvText.split("\n")[0];
    expect(headerLine).not.toContain("Email");
    expect(headerLine).toContain("Name");
    expect(headerLine).toContain("H-Index");
    expect(headerLine).toContain("Website");
    expect(headerLine).toContain("Department");

    // Data rows should be present
    expect(csvText).toContain("Dr. Alice Chen");
    expect(csvText).toContain("https://alice.lab.edu");

    // Export projects
    const { status: projCsvStatus, text: projCsvText } = await exportCsv(
      `${g}/nodes/export?type=${projectTypeId}`,
    );
    expect(projCsvStatus).toBe(200);
    expect(projCsvText).toContain("Graph Research Initiative");
    expect(projCsvText).toContain("500000");

    // ------------------------------------------------------------------
    // Cleanup: delete the graph
    // ------------------------------------------------------------------
    const { status: cleanupStatus } = await del(`/graphs/${graphId}`);
    expect(cleanupStatus).toBe(204);

    // Verify everything is gone via DB
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

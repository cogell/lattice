import { describe, it, expect, vi } from "vitest";
import { resolveEdgeDisplayNames } from "../src/commands/import.js";

/** Helper to build a mock API client with the methods resolveEdgeDisplayNames needs. */
function mockClient(opts: {
  edgeType: {
    source_node_type_id: string;
    target_node_type_id: string;
  };
  sourceNodeType: { name: string; display_field_slug: string | null };
  targetNodeType: { name: string; display_field_slug: string | null };
  sourceNodes: Array<{ id: string; data: Record<string, unknown> }>;
  targetNodes: Array<{ id: string; data: Record<string, unknown> }>;
}) {
  return {
    getEdgeType: vi.fn().mockResolvedValue(opts.edgeType),
    getNodeType: vi.fn().mockImplementation((_graphId: string, nodeTypeId: string) => {
      if (nodeTypeId === opts.edgeType.source_node_type_id) {
        return Promise.resolve(opts.sourceNodeType);
      }
      return Promise.resolve(opts.targetNodeType);
    }),
    listNodes: vi.fn().mockImplementation((_graphId: string, nodeTypeId: string) => {
      const nodes =
        nodeTypeId === opts.edgeType.source_node_type_id
          ? opts.sourceNodes
          : opts.targetNodes;
      return Promise.resolve({
        data: nodes,
        pagination: { total: nodes.length, limit: 100, offset: 0, has_more: false },
      });
    }),
  } as any;
}

describe("resolveEdgeDisplayNames", () => {
  const GRAPH_ID = "graph-1";
  const EDGE_TYPE_ID = "et-1";

  it("passes through CSV unchanged when source_node_id and target_node_id columns exist", async () => {
    const csv = "source_node_id,target_node_id\nnode-1,node-2\n";
    const client = mockClient({
      edgeType: { source_node_type_id: "nt-src", target_node_type_id: "nt-tgt" },
      sourceNodeType: { name: "Character", display_field_slug: "name" },
      targetNodeType: { name: "Species", display_field_slug: "name" },
      sourceNodes: [],
      targetNodes: [],
    });

    const result = await resolveEdgeDisplayNames(csv, EDGE_TYPE_ID, GRAPH_ID, client);
    expect(result).toBe(csv);
    // Should not call any API methods since headers are already IDs
    expect(client.getEdgeType).not.toHaveBeenCalled();
  });

  it("resolves display-name columns to source_node_id and target_node_id", async () => {
    const csv = "Character,Species\nJean-Luc Picard,Human\nWorf,Klingon\n";
    const client = mockClient({
      edgeType: { source_node_type_id: "nt-char", target_node_type_id: "nt-spec" },
      sourceNodeType: { name: "Character", display_field_slug: "name" },
      targetNodeType: { name: "Species", display_field_slug: "name" },
      sourceNodes: [
        { id: "char-1", data: { name: "Jean-Luc Picard" } },
        { id: "char-2", data: { name: "Worf" } },
      ],
      targetNodes: [
        { id: "spec-1", data: { name: "Human" } },
        { id: "spec-2", data: { name: "Klingon" } },
      ],
    });

    const result = await resolveEdgeDisplayNames(csv, EDGE_TYPE_ID, GRAPH_ID, client);
    // Parse result to validate content
    expect(result).toContain("source_node_id");
    expect(result).toContain("target_node_id");
    expect(result).toContain("char-1");
    expect(result).toContain("spec-1");
    expect(result).toContain("char-2");
    expect(result).toContain("spec-2");
    // Should not contain the display-name column headers
    expect(result).not.toContain('"Character"');
    expect(result).not.toContain('"Species"');
  });

  it("handles mixed columns: one display-name and one ID column", async () => {
    const csv = "Character,target_node_id\nJean-Luc Picard,spec-1\n";
    const client = mockClient({
      edgeType: { source_node_type_id: "nt-char", target_node_type_id: "nt-spec" },
      sourceNodeType: { name: "Character", display_field_slug: "name" },
      targetNodeType: { name: "Species", display_field_slug: "name" },
      sourceNodes: [
        { id: "char-1", data: { name: "Jean-Luc Picard" } },
      ],
      targetNodes: [],
    });

    const result = await resolveEdgeDisplayNames(csv, EDGE_TYPE_ID, GRAPH_ID, client);
    expect(result).toContain("source_node_id");
    expect(result).toContain("target_node_id");
    expect(result).toContain("char-1");
    expect(result).toContain("spec-1");
  });

  it("preserves additional data columns alongside display-name columns", async () => {
    const csv = "Character,Species,Weight\nPicard,Human,80\n";
    const client = mockClient({
      edgeType: { source_node_type_id: "nt-char", target_node_type_id: "nt-spec" },
      sourceNodeType: { name: "Character", display_field_slug: "name" },
      targetNodeType: { name: "Species", display_field_slug: "name" },
      sourceNodes: [{ id: "char-1", data: { name: "Picard" } }],
      targetNodes: [{ id: "spec-1", data: { name: "Human" } }],
    });

    const result = await resolveEdgeDisplayNames(csv, EDGE_TYPE_ID, GRAPH_ID, client);
    expect(result).toContain("source_node_id");
    expect(result).toContain("target_node_id");
    expect(result).toContain("Weight");
    expect(result).toContain("80");
    expect(result).toContain("char-1");
    expect(result).toContain("spec-1");
  });

  it("throws when a display value is not found in any node", async () => {
    const csv = "Character,Species\nUnknown Person,Human\n";
    const client = mockClient({
      edgeType: { source_node_type_id: "nt-char", target_node_type_id: "nt-spec" },
      sourceNodeType: { name: "Character", display_field_slug: "name" },
      targetNodeType: { name: "Species", display_field_slug: "name" },
      sourceNodes: [{ id: "char-1", data: { name: "Picard" } }],
      targetNodes: [{ id: "spec-1", data: { name: "Human" } }],
    });

    await expect(
      resolveEdgeDisplayNames(csv, EDGE_TYPE_ID, GRAPH_ID, client),
    ).rejects.toThrow(/Unknown Person/);
  });

  it("throws when display-name column has an empty value", async () => {
    const csv = "Character,Species\n,Human\n";
    const client = mockClient({
      edgeType: { source_node_type_id: "nt-char", target_node_type_id: "nt-spec" },
      sourceNodeType: { name: "Character", display_field_slug: "name" },
      targetNodeType: { name: "Species", display_field_slug: "name" },
      sourceNodes: [],
      targetNodes: [{ id: "spec-1", data: { name: "Human" } }],
    });

    await expect(
      resolveEdgeDisplayNames(csv, EDGE_TYPE_ID, GRAPH_ID, client),
    ).rejects.toThrow(/empty value/);
  });

  it("throws when node type has no display_field_slug configured", async () => {
    const csv = "Character,Species\nPicard,Human\n";
    const client = mockClient({
      edgeType: { source_node_type_id: "nt-char", target_node_type_id: "nt-spec" },
      sourceNodeType: { name: "Character", display_field_slug: null },
      targetNodeType: { name: "Species", display_field_slug: "name" },
      sourceNodes: [],
      targetNodes: [],
    });

    await expect(
      resolveEdgeDisplayNames(csv, EDGE_TYPE_ID, GRAPH_ID, client),
    ).rejects.toThrow(/no display field configured/);
  });

  it("throws when duplicate display values exist for a node type", async () => {
    const csv = "Character,Species\nPicard,Human\n";
    const client = mockClient({
      edgeType: { source_node_type_id: "nt-char", target_node_type_id: "nt-spec" },
      sourceNodeType: { name: "Character", display_field_slug: "name" },
      targetNodeType: { name: "Species", display_field_slug: "name" },
      sourceNodes: [
        { id: "char-1", data: { name: "Picard" } },
        { id: "char-2", data: { name: "Picard" } },
      ],
      targetNodes: [{ id: "spec-1", data: { name: "Human" } }],
    });

    await expect(
      resolveEdgeDisplayNames(csv, EDGE_TYPE_ID, GRAPH_ID, client),
    ).rejects.toThrow(/Duplicate display value/);
  });

  it("throws when neither ID column nor matching node-type-name column exists", async () => {
    const csv = "Foo,Bar\na,b\n";
    const client = mockClient({
      edgeType: { source_node_type_id: "nt-char", target_node_type_id: "nt-spec" },
      sourceNodeType: { name: "Character", display_field_slug: "name" },
      targetNodeType: { name: "Species", display_field_slug: "name" },
      sourceNodes: [],
      targetNodes: [],
    });

    await expect(
      resolveEdgeDisplayNames(csv, EDGE_TYPE_ID, GRAPH_ID, client),
    ).rejects.toThrow(/source_node_id.*Character/);
  });

  it("matches column names case-insensitively", async () => {
    const csv = "character,SPECIES\nPicard,Human\n";
    const client = mockClient({
      edgeType: { source_node_type_id: "nt-char", target_node_type_id: "nt-spec" },
      sourceNodeType: { name: "Character", display_field_slug: "name" },
      targetNodeType: { name: "Species", display_field_slug: "name" },
      sourceNodes: [{ id: "char-1", data: { name: "Picard" } }],
      targetNodes: [{ id: "spec-1", data: { name: "Human" } }],
    });

    const result = await resolveEdgeDisplayNames(csv, EDGE_TYPE_ID, GRAPH_ID, client);
    expect(result).toContain("source_node_id");
    expect(result).toContain("char-1");
    expect(result).toContain("spec-1");
  });

  // --- Same-type edge tests ---

  it("resolves prefixed columns for same-type edges (Source X, Target X)", async () => {
    const csv = "Source Cocktail,Target Cocktail\nBoulevardier,Negroni\nManhattan,Old Fashioned\n";
    const client = mockClient({
      edgeType: { source_node_type_id: "nt-cocktail", target_node_type_id: "nt-cocktail" },
      sourceNodeType: { name: "Cocktail", display_field_slug: "name" },
      targetNodeType: { name: "Cocktail", display_field_slug: "name" },
      sourceNodes: [
        { id: "c-1", data: { name: "Boulevardier" } },
        { id: "c-2", data: { name: "Negroni" } },
        { id: "c-3", data: { name: "Manhattan" } },
        { id: "c-4", data: { name: "Old Fashioned" } },
      ],
      targetNodes: [
        { id: "c-1", data: { name: "Boulevardier" } },
        { id: "c-2", data: { name: "Negroni" } },
        { id: "c-3", data: { name: "Manhattan" } },
        { id: "c-4", data: { name: "Old Fashioned" } },
      ],
    });

    const result = await resolveEdgeDisplayNames(csv, EDGE_TYPE_ID, GRAPH_ID, client);
    expect(result).toContain("source_node_id");
    expect(result).toContain("target_node_id");
    expect(result).toContain("c-1"); // Boulevardier as source
    expect(result).toContain("c-2"); // Negroni as target
    expect(result).toContain("c-3"); // Manhattan as source
    expect(result).toContain("c-4"); // Old Fashioned as target
    expect(result).not.toContain("Cocktail");
  });

  it("throws for same-type edges when using unprefixed column name", async () => {
    const csv = "Cocktail,Cocktail\nBoulevardier,Negroni\n";
    const client = mockClient({
      edgeType: { source_node_type_id: "nt-cocktail", target_node_type_id: "nt-cocktail" },
      sourceNodeType: { name: "Cocktail", display_field_slug: "name" },
      targetNodeType: { name: "Cocktail", display_field_slug: "name" },
      sourceNodes: [],
      targetNodes: [],
    });

    await expect(
      resolveEdgeDisplayNames(csv, EDGE_TYPE_ID, GRAPH_ID, client),
    ).rejects.toThrow(/same source and target node type.*Source Cocktail.*Target Cocktail/);
  });

  it("handles mixed: one prefixed column and one ID column for same-type edges", async () => {
    const csv = "Source Cocktail,target_node_id\nBoulevardier,c-2\n";
    const client = mockClient({
      edgeType: { source_node_type_id: "nt-cocktail", target_node_type_id: "nt-cocktail" },
      sourceNodeType: { name: "Cocktail", display_field_slug: "name" },
      targetNodeType: { name: "Cocktail", display_field_slug: "name" },
      sourceNodes: [
        { id: "c-1", data: { name: "Boulevardier" } },
      ],
      targetNodes: [],
    });

    const result = await resolveEdgeDisplayNames(csv, EDGE_TYPE_ID, GRAPH_ID, client);
    expect(result).toContain("source_node_id");
    expect(result).toContain("target_node_id");
    expect(result).toContain("c-1");
    expect(result).toContain("c-2");
  });

  it("allows prefixed columns for different-type edges too", async () => {
    const csv = "Source Character,Target Species\nPicard,Human\n";
    const client = mockClient({
      edgeType: { source_node_type_id: "nt-char", target_node_type_id: "nt-spec" },
      sourceNodeType: { name: "Character", display_field_slug: "name" },
      targetNodeType: { name: "Species", display_field_slug: "name" },
      sourceNodes: [{ id: "char-1", data: { name: "Picard" } }],
      targetNodes: [{ id: "spec-1", data: { name: "Human" } }],
    });

    const result = await resolveEdgeDisplayNames(csv, EDGE_TYPE_ID, GRAPH_ID, client);
    expect(result).toContain("source_node_id");
    expect(result).toContain("target_node_id");
    expect(result).toContain("char-1");
    expect(result).toContain("spec-1");
  });

  it("throws on ambiguous columns: both exact and prefixed for same side (different types)", async () => {
    const csv = "Character,Source Character,Species\nPicard,Worf,Human\n";
    const client = mockClient({
      edgeType: { source_node_type_id: "nt-char", target_node_type_id: "nt-spec" },
      sourceNodeType: { name: "Character", display_field_slug: "name" },
      targetNodeType: { name: "Species", display_field_slug: "name" },
      sourceNodes: [],
      targetNodes: [],
    });

    await expect(
      resolveEdgeDisplayNames(csv, EDGE_TYPE_ID, GRAPH_ID, client),
    ).rejects.toThrow(/Ambiguous columns.*Character.*Source Character/);
  });

  it("matches prefixed columns case-insensitively for same-type edges", async () => {
    const csv = "source cocktail,TARGET COCKTAIL\nBoulevardier,Negroni\n";
    const client = mockClient({
      edgeType: { source_node_type_id: "nt-cocktail", target_node_type_id: "nt-cocktail" },
      sourceNodeType: { name: "Cocktail", display_field_slug: "name" },
      targetNodeType: { name: "Cocktail", display_field_slug: "name" },
      sourceNodes: [
        { id: "c-1", data: { name: "Boulevardier" } },
        { id: "c-2", data: { name: "Negroni" } },
      ],
      targetNodes: [
        { id: "c-1", data: { name: "Boulevardier" } },
        { id: "c-2", data: { name: "Negroni" } },
      ],
    });

    const result = await resolveEdgeDisplayNames(csv, EDGE_TYPE_ID, GRAPH_ID, client);
    expect(result).toContain("source_node_id");
    expect(result).toContain("target_node_id");
    expect(result).toContain("c-1");
    expect(result).toContain("c-2");
  });

  it("preserves data columns alongside prefixed columns for same-type edges", async () => {
    const csv = "Source Cocktail,Target Cocktail,Notes\nBoulevardier,Negroni,swap bourbon for gin\n";
    const client = mockClient({
      edgeType: { source_node_type_id: "nt-cocktail", target_node_type_id: "nt-cocktail" },
      sourceNodeType: { name: "Cocktail", display_field_slug: "name" },
      targetNodeType: { name: "Cocktail", display_field_slug: "name" },
      sourceNodes: [
        { id: "c-1", data: { name: "Boulevardier" } },
        { id: "c-2", data: { name: "Negroni" } },
      ],
      targetNodes: [
        { id: "c-1", data: { name: "Boulevardier" } },
        { id: "c-2", data: { name: "Negroni" } },
      ],
    });

    const result = await resolveEdgeDisplayNames(csv, EDGE_TYPE_ID, GRAPH_ID, client);
    expect(result).toContain("source_node_id");
    expect(result).toContain("target_node_id");
    expect(result).toContain("Notes");
    expect(result).toContain("swap bourbon for gin");
  });

  it("collects all resolution errors before throwing", async () => {
    const csv = "Character,Species\nAlpha,Beta\nGamma,Delta\n";
    const client = mockClient({
      edgeType: { source_node_type_id: "nt-char", target_node_type_id: "nt-spec" },
      sourceNodeType: { name: "Character", display_field_slug: "name" },
      targetNodeType: { name: "Species", display_field_slug: "name" },
      sourceNodes: [],
      targetNodes: [],
    });

    try {
      await resolveEdgeDisplayNames(csv, EDGE_TYPE_ID, GRAPH_ID, client);
      expect.fail("should have thrown");
    } catch (err: any) {
      // Should mention all 4 failures (2 rows x 2 columns)
      expect(err.message).toContain("Row 1");
      expect(err.message).toContain("Row 2");
      expect(err.message).toContain("Alpha");
      expect(err.message).toContain("Beta");
      expect(err.message).toContain("Gamma");
      expect(err.message).toContain("Delta");
    }
  });
});

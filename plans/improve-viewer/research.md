# Graph View Improvement Research

> Research conducted 2026-03-11 across three parallel tracks:
> first-principles graph visualization, enterprise tool analysis, and current codebase audit.

---

## Part 0: Current Implementation (Codebase Audit)

### Stack

- **Graph library**: React Flow (`@xyflow/react` v12.10.1)
- **Layout engine**: Dagre (`@dagrejs/dagre` v2.0.4) — hierarchical, top-to-bottom
- **Rendering**: SVG/DOM (React Flow default)

### Key Files

| File | Purpose |
|------|---------|
| `packages/web/src/components/GraphCanvas.tsx` | Main visualization container, data transformation, layout application |
| `packages/web/src/components/GraphNode.tsx` | Custom node component with hover tooltips, icon/color rendering |
| `packages/web/src/components/GraphEdge.tsx` | Custom edge component with smooth routing, directed indicators, tooltips |
| `packages/web/src/lib/dagre-layout.ts` | Dagre layout algorithm configuration and execution |
| `packages/web/src/routes/graphs/$graphId/view.tsx` | View route, error handling, empty states, data fetching |
| `packages/web/src/routes/graphs/$graphId.tsx` | Layout with sidebar navigation for node/edge types |
| `packages/web/src/hooks/use-view-data.ts` | React Query hook for fetching graph visualization data |
| `packages/shared/src/view-data.ts` | Data schemas and types for graph visualization |
| `packages/web/src/lib/format-field.ts` | Field value formatting (supports boolean, JSON, text types) |

### Current Capabilities

| Aspect | Current State |
|--------|--------------|
| **Layout** | Dagre hierarchical, top-to-bottom only, fixed 200x60 nodes |
| **Edge rendering** | All edges identical: gray (#94a3b8), 1.5px, smooth-step, no color per type |
| **Edge differentiation** | Only directed vs undirected (arrow marker). No color, dash, or thickness by type |
| **Filtering** | None on canvas. Sidebar lists types but doesn't toggle visibility |
| **Interaction** | Hover tooltips on nodes/edges. No click-to-expand, no pathfinding |
| **Scale handling** | Truncation warning when limits hit. No aggregation or LOD |

### Data Flow

**API Endpoint**: `GET /api/v1/graphs/{graphId}/view-data`

Returns denormalized payload:
```typescript
{
  nodes: Node[],                     // id, graph_id, node_type_id, data
  edges: Edge[],                     // id, source_node_id, target_node_id, edge_type_id, data
  node_types: ViewNodeType[],        // with embedded fields array
  edge_types: ViewEdgeType[],        // with embedded fields array
  truncated: boolean,
  counts: { nodes, edges, node_limit, edge_limit }
}
```

**Data Transformation in GraphCanvas:**
1. Builds lookup maps for node types and edge types
2. Transforms node data: resolves display label from display_field_slug or uses truncated ID; collects color, icon, field metadata
3. Transforms edge data: determines directed/undirected; collects field metadata
4. Applies Dagre layout to compute positions
5. Renders with React Flow

### Node Rendering (GraphNode.tsx)

- Custom React Flow node type: `graphNode`
- Styled cards with left-side colored border (from NodeType `color`), icon (Lucide React), display label, node type subtitle
- Top and bottom connection handles
- Hover tooltips showing all field values
- Memoized for performance

### Edge Rendering (GraphEdge.tsx)

- Custom React Flow edge type: `graphEdge`
- Smooth step path routing
- Arrow marker on directed edges only
- 1.5px stroke in slate gray (#94a3b8)
- Invisible 20px stroke for hover detection
- Hover tooltips showing edge type name, directed/undirected, field values
- Memoized for performance

### Sidebar (in `$graphId.tsx`)

- Left navigation panel (176px wide, scrollable)
- "View" and "Settings" tabs
- **Node Types**: color dot + optional icon + name, links to type detail pages
- **Edge Types**: name only, links to type detail pages
- No toggle/filter functionality

### Core Problem

All 5 edge types (Uses, Made With, Variation Of, Substitute For, etc.) render identically — same gray color, same thickness, same style. The graph is unreadable as data grows because users cannot distinguish relationship types visually.

---

## Part 1: First Principles Research

### 1.1 Visual Encoding for Multi-Relational Edges

#### Munzner's Channel Effectiveness Rankings

Tamara Munzner's *Visualization Analysis and Design* establishes a hierarchy of visual channel effectiveness:

- **Ordered/quantitative data**: spatial position > length > angle > area > luminance > saturation
- **Categorical data** (which edge type is): **spatial region > color hue > motion > shape**

Sources:
- [Munzner, Visualization Analysis and Design](https://www.cs.ubc.ca/~tmm/vadbook/)
- [Chapter 5: Marks and Channels (O'Reilly)](https://www.oreilly.com/library/view/visualization-analysis-and/9781466508910/K14708_C005.xhtml)

#### Edge Differentiation Channels (ranked by effectiveness)

1. **Color hue** — strongest categorical channel. Limited to ~6-8 distinguishable hues in practice, ~5 for colorblind safety. Blue is the safest anchor color; combine with orange/red for maximum discrimination. Use [ColorBrewer](https://colorbrewer2.org/) or [Paul Tol's palettes](https://thenode.biologists.com/data-visualization-with-flying-colors/research/) for accessible categorical schemes.

2. **Dash pattern** — solid, dashed, dotted, dash-dot provide ~3-4 reliably distinguishable patterns. Inherently categorical (no natural ordering). Good secondary channel. Caveat: dashed lines are harder to trace in dense areas.

3. **Line thickness/weight** — conveys magnitude well (3-4 distinct levels distinguishable), but implies ordinal ranking. Better for encoding edge weight/strength than edge type.

4. **Curvature** — useful for distinguishing parallel edges between the same node pair. Edges spread as arcs with varying curvature. G6 (AntV) handles this with `processParallelEdges`.

5. **Labels on edges** — explicit but cluttery; best used on hover/demand.

Sources:
- [Datawrapper: Colorblindness Part 2](https://www.datawrapper.de/blog/colorblindness-part2)
- [G6 ProcessParallelEdges](https://g6.antv.vision/en/manual/transform/process-parallel-edges/)

#### Critical Constraint

**Do not stack more than 2 encoding channels on edges simultaneously.** Encoding edge type via color + dash pattern is feasible. Adding thickness on top pushes past what the visual system can decode on a thin line.

#### Practical Color Limits

- Max reliably distinguishable hues: **6-8** for normal vision
- Colorblind-safe maximum: **~5 colors**
- In context of thin, crossing, overlapping edges: effective discrimination drops to **3-4**
- Beyond 8 colors, it is "close to impossible" to find colors that can be readily distinguished

Sources:
- [GraphPad Colorblind Safe Colors](https://www.graphpad.com/support/faq/colorblind-safe-colors-schemes-and-transparency/)
- [NKI Guidelines for Color Blind Friendly Figures](https://www.nki.nl/about-us/responsible-research/guidelines-color-blind-friendly-figures)
- [Towards Data Science: Accessible Graphs](https://towardsdatascience.com/how-to-create-accessible-graphs-for-colorblind-people-295e517c9b15/)

### 1.2 Layout Algorithms

#### Force-Directed (Fruchterman-Reingold, Kamada-Kawai, d3-force)

Simulates a physical system — nodes repel each other (charge), edges act as springs (attraction). Iterates until equilibrium.

**Pros**: No assumptions about graph structure; aesthetically pleasing for small-to-medium graphs; connected components naturally cluster; works for arbitrary topologies.

**Cons**: O(n^2) per iteration without optimization (Barnes-Hut reduces to O(n log n)); can get stuck in local minima; non-deterministic; **degrades above ~500 nodes** without GPU/WebGL; loses readability for dense graphs.

**Best for**: Organic structure, clusters, no clear hierarchy. Good for "which cocktails share ingredients?" patterns.

Sources:
- [Force-Directed Drawing Algorithms (Graph Drawing Handbook)](https://cs.brown.edu/people/rtamassi/gdhandbook/chapters/force-directed.pdf)

#### Hierarchical / Layered (Sugiyama, 1981 / Dagre)

Four phases: cycle removal, layer assignment, crossing reduction, coordinate assignment. Nodes placed in horizontal/vertical layers.

**Pros**: Makes flow direction explicit; excellent for DAGs; good edge crossing minimization.

**Cons**: Does not work well for cyclic graphs; can produce very wide/tall layouts; not suitable for general undirected graphs.

**Best for**: DAGs, dependency chains, workflows. Good for "Cocktail → uses → Ingredient" hierarchy.

Sources:
- [Hierarchical Drawing Algorithms (Graph Drawing Handbook)](https://cs.brown.edu/people/rtamassi/gdhandbook/chapters/hierarchical.pdf)

#### Radial / Concentric

Focus node at center, others on concentric rings by graph distance. Supports interactive refocusing — click a node and the layout recenters.

**Pros**: Excellent for ego-network exploration; clear distance encoding; pairs well with edge bundling; scales when combined with progressive disclosure.

**Cons**: Path following across rings is harder; wastes space in outer rings.

**Best for**: "Show me everything related to Negroni" — ego-centered investigation.

Sources:
- [Animated Exploration of Graphs with Radial Layout](https://bailando.berkeley.edu/papers/infovis01.htm)
- [yWorks: Drawing Radial Diagrams](https://www.yworks.com/pages/drawing-radial-diagrams)
- [G6 Radial Layout](https://g6.antv.antgroup.com/en/manual/layout/radial-layout)

#### Orthogonal

All edges at right angles (horizontal/vertical only). Grid-like appearance.

**Best for**: ER diagrams, circuit diagrams, UML, database schemas. **Not ideal for your data.**

Sources:
- [yWorks: Drawing Orthogonal Diagrams](https://www.yworks.com/pages/drawing-orthogonal-diagrams)
- [yFiles Layout Summary](https://docs.yworks.com/yfiles-html/dguide/layout/layout-summary.html)

#### Matrix / Adjacency View (Alternative to Node-Link)

Not a layout algorithm but an entirely different representation. Nodes become row/column headers; cells indicate edges.

**When to switch from node-link to matrix** (Ghoniem, Fekete, Castagliola, 2004):
- Graph density > ~0.3 (30% of possible edges exist)
- More than ~50 nodes with high connectivity
- Task involves comparing connectivity patterns, finding clusters, or analyzing edge weights
- Path-finding is NOT the primary task (matrices are terrible for path tracing)

**Key finding**: Adjacency matrices **outperform** node-link diagrams for dense graphs on all tasks except path-finding.

Sources:
- [Node-link or Adjacency Matrices: Old Question, New Insights](https://www2.cs.arizona.edu/~kobourov/NL-AM-TVCG18.pdf)
- [Adjacency Matrix Techniques (VDL, U. Utah)](https://vdl.sci.utah.edu/mvnv/techniques/adj-matrix/)
- [Vistorian Visualizations](https://vistorian.github.io/visualizations.html)

### 1.3 The Multi-Relational Graph Problem

This is the **core** research question. A graph with multiple edge types requires specific strategies.

#### Approach 1: Edge Type Layering (Toggle Visibility)

Show one relationship type at a time, with toggles to switch.

**Implementation**: Panel listing all edge types with checkboxes. Toggling immediately shows/hides those edges. **Critical: keep node positions stable across toggles** (do NOT re-run layout — this preserves the user's mental map).

**Pros**: Zero visual clutter from competing types; focus on one relationship at a time.
**Cons**: Cannot see cross-type patterns.

#### Approach 2: Small Multiples

N separate views, one per edge type, with **identical node positions**. Same nodes in each panel; only edges differ.

**Pros**: Side-by-side comparison; preserves spatial consistency.
**Cons**: Screen real estate; doesn't scale past ~4-6 types.

**Critical rule**: All panels MUST share the same layout. If each uses its own force-directed layout, positions differ and comparison becomes impossible.

#### Approach 3: Color-Coded Edges in a Single View

All edges visible simultaneously, distinguished by color.

**Hard limit**: Humans can reliably distinguish **3-4 edge types** simultaneously in a node-link diagram before cognitive overload. At 5+, the visual field becomes confusing. At 8+, close to impossible.

**Mitigations**:
- Combine color with dash pattern to extend to ~6 types (2 dash × 3 colors)
- Use opacity: dim inactive types, full opacity for the active/explored type
- Allow "solo" mode (show only that type, dim everything else)

#### Approach 4: Matrix View for Dense Multi-Relational Data

Adjacency matrix with edge-type encoding in cells (color-coded dots, stacked bars). Each cell shows which relationship types exist between that node pair.

**When to use**: High density AND multiple edge types AND pattern discovery is the primary task.

#### Approach 5: Semantic Substrates (Shneiderman & Aris, 2006)

Nodes placed in user-defined rectangular regions based on attributes. Edges drawn between regions with interactive sliders controlling visibility.

**Example**: Region A = Cocktails, Region B = Ingredients, Region C = Techniques. Show only "Uses" edges, then switch to "Substitute For." Node positions determined by attributes (e.g., date, popularity), not topology.

**Advantage**: Separates node layout from edge display — extremely powerful for multi-relational data. Layout is stable and meaningful regardless of which edge types are visible.

Sources:
- [Shneiderman & Aris, Network Visualization by Semantic Substrates (2006)](https://www.cs.umd.edu/~ben/papers/Shneiderman2006Network.pdf)
- [Designing Semantic Substrates for Visual Network Exploration](https://journals.sagepub.com/doi/10.1057/palgrave.ivs.9500162)
- [McGee et al., The State of the Art in Multilayer Network Visualization (2019)](https://onlinelibrary.wiley.com/doi/full/10.1111/cgf.13610)

#### Recommended Strategy for Lattice

| Scale | Primary View | Edge Type Strategy |
|-------|-------------|-------------------|
| 50 nodes | Force-directed node-link | Color-code all types (up to 4) |
| 100-200 nodes | Force-directed with semantic zoom | Show 1-2 types by default, toggle others |
| 200-500 nodes | Force-directed with LOD + aggregation | Default to single edge type, "solo" mode |
| 500+ nodes | Meta-node aggregation, matrix | Layered view mandatory, aggregated edge counts |

### 1.4 Interaction Patterns

#### Filtering and Faceting

The single most important interaction for this use case:
- **Filter by edge type** — toggle individual relationship types on/off
- **Filter by node type** — show/hide categories
- **Filter by attribute** — degree threshold, weight, date range
- **Compound filters** — "show me all Uses edges between Cocktail and Ingredient nodes"

#### Progressive Disclosure / Semantic Zoom

Changes **what** is shown (not just magnification) based on zoom level:
- **Far zoom**: Nodes as dots, no labels, edges as thin lines or bundles. Global structure.
- **Mid zoom**: Labels for high-degree nodes, edge colors visible.
- **Close zoom**: Full labels, edge labels, node attributes, parallel edges distinguished.

Sources:
- [Semantic Zooming for Ontology Graph Visualizations](https://www.researchgate.net/publication/321894105_Semantic_Zooming_for_Ontology_Graph_Visualizations)
- [Cockburn et al., A Review of Overview+Detail, Zooming, and Focus+Context Interfaces](https://www.researchgate.net/publication/220566544_A_Review_of_OverviewDetail_Zooming_and_FocusContext_Interfaces)

#### Focus + Context

- **Fisheye distortion**: Magnifies area around cursor while compressing periphery. Preserves context but can disorient.
- **Detail-on-demand panels**: Click a node → full attributes + local neighborhood in side panel. Non-distorting.
- **Radial focus layout**: Recenters graph around selected node with concentric distance rings.

#### Brushing and Linking

Selecting elements in one view highlights corresponding elements in all linked views. Essential for multi-view systems (node-link + matrix + attribute table).

Sources:
- [Dynamic Graph Exploration by Interactively Linked Node-Link Diagrams and Matrix Visualizations](https://pmc.ncbi.nlm.nih.gov/articles/PMC8423958/)
- [Brushing and Linking (Wikipedia)](https://en.wikipedia.org/wiki/Brushing_and_linking)

#### Path Finding and Neighborhood Exploration

- **Shortest path highlighting**: Select two nodes → compute and highlight shortest path(s)
- **N-hop neighborhood**: "Show everything within 2 hops of this node"
- **Expand/collapse**: Start with seed node → expand neighbors on demand. **Critical UX**: when expanding/collapsing, preserve the user's mental map — don't rearrange the entire graph.

Sources:
- [yFiles: Collapsing Groups in Diagrams](https://www.yfiles.com/resources/how-to/collapsing-groups-in-diagrams)
- [Pathfinder: Visual Analysis of Paths in Graphs](https://ncbi.nlm.nih.gov/pmc/articles/PMC5146994)

### 1.5 Scaling Techniques

#### Edge Bundling

- **Hierarchical Edge Bundling** (Holten, 2006): Requires a hierarchy. Routes edges along hierarchy tree with tension parameter.
- **Force-Directed Edge Bundling** (Holten & van Wijk, 2009): No hierarchy needed. Models edges as flexible springs. Produces smooth bundles.
- **Multilevel Agglomerative Edge Bundling** (Gansner et al., 2011): Handles hundreds of thousands of edges in seconds.

**Caveat**: Bundling can create false impressions of connections. It trades individual edge traceability for aggregate pattern visibility.

Sources:
- [Holten, Hierarchical Edge Bundles (2006)](https://www.cs.jhu.edu/~misha/ReadingSeminar/Papers/Holten06.pdf)
- [Holten & van Wijk, Force-Directed Edge Bundling (2009)](https://classes.engineering.wustl.edu/cse557/readings/holten-edgebundling.pdf)
- [Gansner et al., Multilevel Agglomerative Edge Bundling](http://yifanhu.net/PUB/edge_bundling.pdf)
- [Edge Bundling in Information Visualization (survey)](https://lliquid.github.io/homepage/files/ts13_edgebundle.pdf)

#### Aggregation and Meta-Nodes (Combos)

1. Detect communities (Louvain, label propagation, etc.)
2. Collapse each community into a single meta-node
3. Aggregate inter-community edges into weighted meta-edges
4. Allow drill-down to expand any meta-node

The single most effective technique for scaling from 500 nodes to arbitrarily large graphs.

#### Level-of-Detail (LOD) Rendering

At different zoom levels, render with varying fidelity:
- **Zoomed out**: Simple circles, no labels, single-pixel edges
- **Zoomed in**: Rich glyphs, full labels, styled edges

Zinsmaier et al. (2012) demonstrated interactive LOD rendering of graphs with ~10^7 nodes and ~10^6 edges.

Sources:
- [Zinsmaier et al., Interactive Level-of-Detail Rendering of Large Graphs](https://graphics.uni-konstanz.de/publikationen/Zinsmaier2012InteractiveLevelDetail/Zinsmaier2012InteractiveLevelDetail.pdf)

#### Virtual Viewport / Canvas Optimization

- Only render visible elements (frustum culling)
- Spatial indexing (quadtree/R-tree) for hit testing
- Pre-render node textures (PIXI.js sprite approach)
- Offload layout to Web Workers

**Performance benchmarks**: Canvas > SVG; WebGL > Canvas. D3's SVG struggles above ~1,000 nodes; Sigma.js (WebGL) handles ~10,000. For 50-500 nodes, React Flow's DOM/SVG is sufficient.

Sources:
- [Graph Visualization Efficiency of Popular Web-based Libraries](https://pmc.ncbi.nlm.nih.gov/articles/PMC12061801/)
- [Scale Up D3 Graph Visualization with PIXI.js (GraphAware)](https://graphaware.com/blog/scale-up-your-d3-graph-visualisation-webgl-canvas-with-pixi-js/)

#### Taming the Hairball (in order of impact)

1. **Filter** — remove less important edges
2. **Aggregate** — collapse clusters into meta-nodes
3. **Bundle** — group remaining edges into bundles
4. **Switch representation** — move from node-link to adjacency matrix for dense subgraphs
5. **Decompose** — show subgraphs via small multiples

### 1.6 Cognitive Load and Readability

#### Hard Limits on Simultaneous Visual Tracking

- **Miller's Law (7 ± 2)**: Short-term memory limit. Upper bound for distinct categories in working memory.
- **Subitizing limit (~4)**: Humans instantly count/identify up to ~4 items. More operationally relevant for "how many edge types can I track."
- **Practical edge type limit**: ~3-4 simultaneously visible, with filtering to reduce when more exist.

#### Edge Crossings

Key findings (Huang, Eades, Hong, 2009):
- Impact is **significant for small graphs** but **not significant for large graphs** — users adopt different strategies at scale
- **Crossing angle matters more than crossing count**: near-90° crossings far less disruptive than acute angles
- Eye-tracking confirms acute-angle crossings cause significantly more fixation time and errors
- For graphs with >50 nodes and high density, users cannot find shortest paths reliably

**Implication**: Optimize for crossing angle (prefer perpendicular), not just crossing count.

Sources:
- [Are Crossings Important for Drawing Large Graphs? (Kobourov)](https://raptor.cs.arizona.edu/people/kobourov/crossings.pdf)
- [The State of the Art in Empirical User Evaluation of Graph Visualizations](https://eprints.gla.ac.uk/227646/1/227646.pdf)
- [Edge Crossing Minimization in Graphs (survey)](https://aftabhussain.github.io/documents/pubs/tech-report10-cross-min.pdf)

#### Gestalt Principles Applied to Graph Viz

1. **Connection > Similarity**: Edges dominate — users group connected elements together even if they have different colors. You cannot override edge-based grouping with color alone; you need spatial separation.

2. **Proximity as implicit encoding**: In force-directed layouts, proximity implies connectivity. Risk: unconnected nearby nodes appear related.

3. **Continuity for edge tracing**: Smooth, continuous curves easier to trace than jagged/sharply bending lines. Bundled edges (smooth curves) > orthogonal routes with many bends.

4. **Enclosure for grouping**: Convex hulls or shaded backgrounds are one of the strongest grouping cues. Stronger than color similarity.

Sources:
- [Gestalt Principles for Data Visualization](https://emeeks.github.io/gestaltdataviz/section1.html)
- [Gestalt Principles in Graph Drawing (ACM)](https://dl.acm.org/doi/10.1007/978-3-319-27261-0_50)

#### Information Scent and Wayfinding

- **Landmarks**: Flag high-degree or high-importance nodes as visual landmarks (larger size, distinct color, persistent labels). Provides orientation.
- **Routes**: Highlight paths between landmarks for navigable corridors.
- **Decision points**: Nodes with high branching factor are "intersections" — provide extra visual cues.
- **Information scent**: At each node, provide cues about what lies further (edge count, type distribution).

Sources:
- [Cerioli et al., Designing Complex Network Visualisations Using the Wayfinding Map Metaphor (2024)](https://journals.sagepub.com/doi/10.1177/14738716241270341)

#### Scale Shift Principle

Huang et al. (2020): As graph size increases, the visualization must shift from supporting **detailed local tasks** to supporting **overview/pattern tasks**. The same design that works for 50 nodes actively *harms* performance at 500 nodes because users at that scale need aggregate patterns, not individual edge tracing.

Sources:
- [Scalability of Network Visualisation from a Cognitive Load Perspective (2020)](https://pubmed.ncbi.nlm.nih.gov/33301404/)
- [Cognitive Load as a Guide (Nightingale)](https://nightingaledvs.com/cognitive-load-as-a-guide-12-spectrums-to-improve-your-data-visualizations/)

---

## Part 2: Enterprise Tool Analysis

### 2.1 Palantir Foundry (Vertex)

**Edge handling**:
- Color edges by type or by a property value
- Configurable line style: straight, curved, or orthogonal
- Width encoding by property (e.g., transaction volume between entities)
- Edge badges showing aggregated counts
- Saved views: multiple styling configurations for the same graph

**Filtering**:
- "Search Around" panel: click a node → filter by relationship type, add property filters → expand neighborhood
- Per-type toggle for edge visibility
- Full sidebar with property-based filtering (free-text, multi-select, date ranges)

**Notable features**:
- Linked objects component groups objects by link type with inline property preview
- Object Explorer provides group graphs showing link types between object type groups
- Graph templates for reusable configurations

Sources:
- [Vertex Display Options](https://www.palantir.com/docs/foundry/vertex/graphs-display-options)
- [Vertex Relationship Exploration](https://www.palantir.com/docs/foundry/vertex/explore-object-relationships)
- [Object Explorer](https://www.palantir.com/docs/foundry/object-explorer/getting-started)
- [Vertex Graph Templates](https://www.palantir.com/docs/foundry/vertex/graphs-template)

### 2.2 Neo4j Bloom

**Perspectives** (admin-defined view presets): A Perspective defines a business context — mapping graph labels to categories. Different Perspectives on the same graph provide different filtered views. Admins can **hide specific relationship types** from exploration.

**Selective neighborhood expansion**: Right-click a node → expand along a **specific relationship type and direction**, or use Advanced Expansion dialog to choose multiple paths, target node types, or limit result count.

**Rule-based styling**: Color/size nodes and edges by property values. "Nodes with higher scores appear larger."

**Other notable features**:
- Near-natural-language search bar with auto-suggestions
- Search Phrases (pre-defined Cypher queries with friendly aliases)
- Scene saving and sharing (read-only)
- Histogram/Slicer for temporal/numerical filtering
- Dismiss operation: remove irrelevant nodes without deleting data
- Scene Actions: parameterized queries triggered from context menu

Sources:
- [Bloom Overview](https://neo4j.com/docs/bloom-user-guide/current/bloom-visual-tour/bloom-overview/)
- [Bloom Perspectives](https://neo4j.com/docs/bloom-user-guide/current/bloom-perspectives/bloom-perspectives/)
- [Bloom Scene Interactions](https://neo4j.com/docs/bloom-user-guide/current/bloom-visual-tour/bloom-scene-interactions/)
- [Bloom Search Bar](https://neo4j.com/docs/bloom-user-guide/current/bloom-visual-tour/search-bar/)
- [Bloom Scene Actions](https://neo4j.com/docs/bloom-user-guide/current/bloom-tutorial/scene-actions/)

### 2.3 Cambridge Intelligence (KeyLines / ReGraph)

The gold standard for enterprise graph visualization UX.

**Combos**: Visual groupings of nodes that can be styled, opened, closed, nested, and moved. Critical for reducing complexity.

**Time Bar**: Interactive temporal slider for filtering time-based graph data. Shows how connections evolve. One of their most popular features.

**Progressive disclosure via zoom levels**: Different amounts of information revealed at each zoom level.

**Other features**:
- 8 automatic layouts suited for different network structures
- GPU-based rendering for smooth interaction
- KronoGraph companion timeline product
- Flexible filtering with custom logic
- Label styling (borders, colors, padding) on link labels

**Core UX advice** (from their [graph visualization UX guide](https://cambridge-intelligence.com/graph-visualization-ux-how-to-avoid-wrecking-your-graph-visualization/)): "Styling is information encoding — use predictable patterns, same colors for same types, same shapes for same categories."

Sources:
- [KeyLines Features](https://cambridge-intelligence.com/keylines/features/)
- [Combos Documentation](https://cambridge-intelligence.com/combos/)
- [Time Bar](https://cambridge-intelligence.com/time/)
- [KronoGraph](https://cambridge-intelligence.com/kronograph/)
- [Graph Visualization UX Guide](https://cambridge-intelligence.com/graph-visualization-ux-how-to-avoid-wrecking-your-graph-visualization/)

### 2.4 Linkurious Enterprise

**Filter panel**: Two-tab design (Nodes / Edges). The Edges tab lists all edge types with **toggle switches to show/hide each type** instantly. This is the minimum viable pattern for multi-relational clarity.

**Other features**:
- Powered by Ogma (their own high-performance JS library)
- Lasso selection: draw to select → context menu actions
- Time filtering with interactive timeline controls
- No-Code Query Builder (v4.2)
- Comments, tagging, and team collaboration
- Alerts and case management
- Spaces for workspace organization
- Saved visualizations exportable to URLs

Sources:
- [Filter Panel Docs](https://doc.linkurious.com/user-manual/latest/filter-panel/)
- [Lasso Docs](https://doc.linkurious.com/user-manual/latest/lasso/)
- [Time Filtering](https://linkurious.com/blog/time-filtering-linkurious/)
- [Linkurious Enterprise 4.2](https://linkurious.com/blog/linkurious-enterprise-4-2/)
- [Team Collaboration](https://linkurious.com/blog/team-collaboration-linkurious-enterprise/)

### 2.5 Ogma (by Linkurious)

Linkurious's standalone JS graph library, competing with KeyLines.

- WebGL rendering, modular architecture: handles **100,000+ elements** on 5-year-old hardware
- **40x faster layouts** than competing solutions in benchmarks
- Built-in aggregation: node grouping, edge grouping, sub-graph transforms, path shortening, visual clustering, LOD zooming
- Map overlay for geospatial context

Sources:
- [Ogma Docs](https://doc.linkurious.com/ogma/latest/)
- [Ogma Features](https://linkurious.com/ogma/)
- [Ogma 5.3 Release](https://linkurious.com/blog/ogma-5-3/)

### 2.6 Tom Sawyer Perspectives

- Nested drawings (graphs within graphs — compound structures)
- **Incremental layout**: new nodes added without disrupting existing layout
- Built-in graph algorithms: shortest path, centrality, connectivity, clustering
- Data integrators: Neo4j, REST, JSON, XML, SQL, Excel, RDF
- Port and connector controls for precise edge routing
- Swimlanes for visual row/column grouping

Sources:
- [Tom Sawyer Graph Visualization](https://www.tomsawyer.com/graph-visualization)
- [Tom Sawyer Perspectives](https://www.tomsawyer.com/perspectives)

### 2.7 Graphistry (GPU-Accelerated)

- GPU-accelerated everything: CUDA support, RAPIDS integration, 100x+ speedups
- GeoViz hybrid mode: graph + map + time-series playback
- **Auto-generated histogram panels** for every node/edge property with crossfiltering
- 100+ data source connectors
- MCP server for AI agent integration
- Air-gapped deployment support

Sources:
- [Graphistry Homepage](https://www.graphistry.com/)
- [PyGraphistry GitHub](https://github.com/graphistry/pygraphistry)
- [Graphistry MCP](https://github.com/graphistry/graphistry-mcp)

### 2.8 yWorks (yFiles)

The most mature commercial graph layout engine (25+ years).

- **Edge bundling** with controllable strength
- Filtering: temporarily hide unimportant elements
- Grouping and folding (collapse/expand)
- Swimlanes
- **yFiles for React Flow**: layout algorithms usable as plugins within React Flow
- The broadest set of automatic layout algorithms in any commercial product

Sources:
- [yFiles Features](https://www.yworks.com/products/yfiles/features)
- [Edge Bundling Docs](https://docs.yworks.com/yfiles-html/dguide/layout-features/layout-edge_bundling.html)
- [yFiles for React Flow](https://www.yworks.com/pages/yfiles-layout-algorithms-for-react-flow)

### 2.9 G6/Graphin (AntV)

- **`processParallelEdges` transform**: automatically offsets multiple edges between same node pair as arcs with different curvature
- Multiple layout algorithms switchable at runtime (10+ layouts, some Rust/WebGPU accelerated)
- Combo (meta-node) support built-in
- Canvas/SVG/WebGL renderers
- 3D support

Sources:
- [G6 v5](https://g6.antv.antgroup.com/en)
- [G6 ProcessParallelEdges](https://g6.antv.vision/en/manual/transform/process-parallel-edges/)

### 2.10 Gephi / Gephi Lite

**Gephi Lite v1.0** (October 2025): Web-based successor.

- Dual views: graph + data table with shared selections, filters, and metrics
- Topological filters: connected components, k-core, ego network (subgraph within N hops)
- Touch/multitouch support

Sources:
- [Gephi Lite v1.0](https://gephi.wordpress.com/2025/10/08/gephi-lite-v1/)
- [Gephi Lite v0.6](https://www.ouestware.com/2025/02/26/gephi-lite-0-6-en/)

### 2.11 Intelligence/Investigation Tools

#### IBM i2 Analyst's Notebook

- Link type categorization with display options: single link, directional links, or **separate links per type**
- "Multiplicity of Connection" — explicit UI control for how multiple relationships between same entities display
- Social Network Analysis: centrality, group structure, communication flow
- Considered legacy; competitors like DataWalk position against it

Sources:
- [IBM i2 Docs](https://www.ibm.com/docs/en/SSJSV9_9.2.1/com.ibm.i2.anb.doc/analysts_notebook_pdf.pdf)
- [IBM i2 SNA](https://goodtimesweb.org/surveillance/2013/ibm-i2-sna.pdf)
- [DataWalk vs i2](https://datawalk.com/ibm-i2-competitors/)

#### Maltego

- Transform-based discovery: start with one entity → run Transforms → discover and plot connected entities
- 5 layout modes: block, hierarchical, circular, organic, interactive organic
- 8 view modes encoding different analytical metrics into node size
- 100+ pre-built connectors

Sources:
- [Maltego Graph](https://www.maltego.com/graph/)
- [Maltego Data](https://www.maltego.com/maltego-data/)

---

## Part 3: Library Comparison

| Library | Renderer | Node Capacity | Layout Engine | Key Strength | Key Limitation |
|---------|----------|---------------|---------------|-------------|----------------|
| **React Flow (XyFlow)** | DOM/SVG | Hundreds to low thousands | External (Dagre, ELK) | React-native, workflow UIs, virtualization | Not designed for dense network graphs |
| **Cytoscape.js** | Canvas | ~5,000-10,000 | Cola, Dagre, CoSE, fCoSE | Compound nodes, graph algorithms, rich extensions, MIT | Performance ceiling below WebGL |
| **Sigma.js v3** | WebGL | 10,000-100,000+ | External (Graphology) | Raw rendering performance for massive graphs | Fewer built-in features |
| **D3.js** | SVG (default) | ~1,000-5,000 | Force simulation | Total creative control, massive ecosystem | SVG limits scale; steep learning curve |
| **G6 v5 (AntV)** | Canvas/SVG/WebGL | 10,000+ | 10+ layouts, some Rust/WebGPU | Combo nodes, 3D, multiple renderers | Documentation primarily Chinese-first |
| **vis.js** | Canvas | ~1,000 | Force-directed | Easy API, clustering support | **No longer actively maintained** |
| **Ogma** | WebGL | 100,000+ | Force, hierarchical | 40x faster layouts, built-in grouping | Commercial license only |
| **KeyLines** | WebGL/Canvas | Tens of thousands | 8 built-in layouts | Combos, time bar, enterprise support | Commercial license only |

**Key takeaway**: At 50-500 nodes, **all** libraries perform adequately. The choice is about features, not performance. If staying with React Flow, **yFiles has a plugin** for superior layout algorithms. If considering a switch, **Cytoscape.js** or **G6 v5** are best fits for this scale and feature needs.

Sources:
- [JS Graph Lib Comparison (Cytoscape team)](https://github.com/cytoscape/js-graph-lib-comparison)
- [Cylynx Comparison](https://www.cylynx.io/blog/a-comparison-of-javascript-graph-network-visualisation-libraries/)
- [Best Libraries for Large Force-Directed Graphs](https://weber-stephen.medium.com/the-best-libraries-and-methods-to-render-large-network-graphs-on-the-web-d122ece2f4dc)

---

## Part 4: Standard Interaction Patterns (de facto across enterprise tools)

| Interaction | Pattern | Adopted By |
|-------------|---------|-----------|
| **Hover** | Show tooltip with key properties | Universal |
| **Click** | Select, show detail in inspector panel | Universal |
| **Double-click** | Expand/collapse neighbors | Neo4j Bloom, Linkurious, KeyLines |
| **Right-click** | Context menu: expand by type, dismiss, hide, pin, select neighbors | Neo4j Bloom, Linkurious, KeyLines, Palantir |
| **Drag** | Move individual nodes | Universal |
| **Lasso select** | Draw freeform selection around multiple nodes | Linkurious, KeyLines, Palantir |
| **Scroll** | Zoom in/out | Universal |
| **Pan** | Click-drag on background | Universal |

### Sidebar/Panel Layout Pattern

| Position | Content | Examples |
|----------|---------|---------|
| **Left sidebar** | Filter panel with node-type and edge-type toggles | Linkurious, Palantir |
| **Right sidebar / Inspector** | Detail panel for selected node or edge | Neo4j Bloom, KeyLines |
| **Bottom bar** | Timeline / time bar for temporal filtering | KeyLines, Linkurious, Palantir |
| **Top bar** | Search input with autocomplete/suggestions | Neo4j Bloom, Linkurious |
| **Collapsible panels** | Full filter sidebar with expand/collapse toggle | Palantir Foundry |

---

## Part 5: Prioritized Feature Recommendations

### Tier 1 — Fix the Core Problem (Edge Type Confusion)

| # | Feature | Inspiration | Impact |
|---|---------|-------------|--------|
| 1 | **Color-code edges by type** 🚧 | Universal (all enterprise tools) | Assigns distinct hues to each edge type. Combine with dash patterns for colorblind safety. |
| 2 | **Edge type filter toggles in sidebar** | Linkurious filter panel | Checkbox/toggle per edge type to show/hide. **Single most impactful feature.** |
| 3 | **Stable layout on edge toggle** | All enterprise tools | Do NOT re-run layout when toggling edges. Preserves user's mental map. |
| 4 | **Parallel edge handling** | G6 `processParallelEdges` | When two nodes share edges of different types, offset as arcs with different curvature. |

### Tier 2 — Improve Exploration

| # | Feature | Inspiration | Impact |
|---|---------|-------------|--------|
| 5 | **Hover highlight** | Universal | Hover a node → highlight its edges and neighbors, dim everything else. |
| 6 | **Click → detail inspector panel** | Neo4j Bloom, KeyLines | Right sidebar showing full properties of selected node/edge. |
| 7 | **Right-click → expand by edge type** | Neo4j Bloom Advanced Expansion | Choose which relationship type to expand. Builds graph incrementally. |
| 8 | **Multiple layout algorithms** | Cambridge Intelligence | Add force-directed and radial alongside Dagre. Layout picker dropdown. |
| 9 | **View presets / perspectives** | Neo4j Bloom Perspectives | Pre-built views: "Ingredient Explorer", "Cocktail Family Tree", "Technique Map". |

### Tier 3 — Scale and Polish

| # | Feature | Inspiration | Impact |
|---|---------|-------------|--------|
| 10 | **Semantic zoom** | Cambridge Intelligence | Zoomed out: color dots. Zoomed in: labels. More zoomed: full detail. |
| 11 | **Node type grouping / combos** | KeyLines, Cytoscape.js, G6 | Collapse all Ingredients into one meta-node when zoomed out. |
| 12 | **Search with autocomplete** | Neo4j Bloom | Type-ahead → highlight + center in graph. |
| 13 | **Edge bundling** | yFiles, G6 | Reduce visual clutter for dense areas. |
| 14 | **Saved views / bookmarks** | Palantir Vertex, Neo4j Bloom | Save filter + layout + zoom states as named presets. |

### Tier 4 — Advanced

| # | Feature | Inspiration | Impact |
|---|---------|-------------|--------|
| 15 | **Small multiples mode** | Academic research | Split view showing one edge type per panel, same node positions. |
| 16 | **Shortest path highlighting** | Tom Sawyer, Cytoscape.js | "What connects Negroni to Sazerac?" |
| 17 | **Lasso select + batch operations** | Linkurious | Draw around cluster → bulk actions. |
| 18 | **Dismiss/prune nodes** | Neo4j Bloom | Remove irrelevant nodes without deleting data. |
| 19 | **Dual view: graph + table** | Gephi Lite | Synchronized graph and table with shared selections. |
| 20 | **Glyph/badge decorators** | KeyLines, Palantir | Small icons/numbers overlaid on nodes (e.g., ingredient count badge). |

---
status: active
feature: color-code-edges
created: 2026-03-11
completed: null
---

# PRD: Color-Code Edges by Type

## Problem Statement

All edge types in the graph viewer render identically — same gray color (#94a3b8), same thickness, same style. When a graph has multiple relationship types (e.g., "Uses", "Made With", "Variation Of", "Substitute For"), users cannot visually distinguish them. The graph becomes unreadable as data grows because every edge looks the same.

This is the single most fundamental visualization deficiency: color hue is the strongest categorical visual channel (Munzner), and every enterprise graph tool — Palantir, Neo4j Bloom, KeyLines, Linkurious — color-codes edges by type as a baseline feature.

## Solution

Assign a distinct color to each edge type. Colors render on the edge stroke, arrow markers (for directed edges), and sidebar indicators. Users can customize colors; new edge types auto-assign from a palette. The system supports up to 12 distinguishable colors using the existing Tailwind-based palette already used for node types.

## User Stories

1. As a graph viewer, I want each edge type to render in a distinct color so that I can visually distinguish relationship types without hovering.
2. As a graph viewer, I want directed edge arrow markers to match the edge type color so that the visual encoding is consistent.
3. As a graph viewer, I want the sidebar to show a colored dot next to each edge type name so that I can associate the legend with what I see on the canvas.
4. As a graph creator, I want new edge types to auto-assign a color from a palette so that I get useful visual differentiation without manual setup.
5. As a graph creator, I want to pick a custom color for an edge type when creating it so that I can choose meaningful colors for my domain.
6. As a graph editor, I want to change an edge type's color after creation so that I can adjust the visual encoding as my graph evolves.
7. As a graph creator with existing edge types, I want my pre-existing edge types to receive auto-assigned colors after the upgrade so that my graphs immediately benefit without manual intervention.
8. As a graph viewer, I want edge type colors in tooltips to reinforce the color-type association so that the mapping is learnable.

## Implementation Decisions

### Database schema

- Add a `color` TEXT column (nullable) to the `edge_types` table via a new migration.
- The migration auto-assigns colors to all existing edge types by rotating through the palette, grouped per graph (so each graph gets its own color rotation starting from the first palette color).

### Shared schemas

- Add `color` (string, nullable) to `edgeTypeSchema`, `createEdgeTypeSchema` (optional), and `updateEdgeTypeSchema` (optional, nullable).
- Mirrors the existing pattern established by node type schemas.

### API edge type routes

- CRUD endpoints accept and return the `color` field.
- On POST (create): if no color is provided, auto-assign the next unused palette color within that graph. If all palette colors are in use, cycle back to the beginning.
- On PATCH (update): allow setting or clearing color.
- The view-data endpoint already returns all edge type columns, so no changes are needed there.

### Color palette

- Extract the existing 12-color Tailwind palette (currently inlined in `CreateNodeTypeDialog`) into a shared utility module.
- Both node type and edge type components reuse this palette.
- Add an auto-assignment function that takes the set of already-used colors in a graph and returns the next available palette color.
- Node types and edge types draw from independent color pools (an edge type can reuse a node type's color — this is fine because they encode different visual elements).

### Edge rendering

- The `GraphEdge` component reads the edge type color from its data and applies it to the stroke and arrow marker.
- Falls back to the current gray (#94a3b8) if color is null for any reason.
- The `GraphCanvas` data transformation passes the edge type color through to each edge's data payload.

### Sidebar

- Edge type links in the sidebar gain a colored dot indicator, matching the existing pattern used by node type links.

### Edge type create/edit UI

- The create edge type dialog gains a color picker (same palette grid component used by node types).
- The edit/update edge type form gains the same color picker.

## Testing Decisions

- **API integration tests**: Verify that creating an edge type without a color auto-assigns one; verify that creating with an explicit color preserves it; verify that updating color works; verify that the view-data response includes edge type colors.
- **Migration test**: Verify that existing edge types receive colors after migration (manual verification is acceptable here).
- **Frontend**: Visual verification that edges render in their type's color, arrow markers match, and sidebar shows colored dots. No automated frontend tests required for this feature.

## Out of Scope

- **Dash patterns for colorblind accessibility** — planned as a follow-up feature (Tier 1, Feature #1 is color-only).
- **Edge type filter toggles** — separate Tier 1 feature (#2).
- **Parallel edge handling** (curvature offsets for multi-edges between same node pair) — separate Tier 1 feature (#4).
- **Stable layout on toggle** — separate Tier 1 feature (#3).
- **Edge thickness encoding** — not planned for this feature; thickness implies ordinal ranking and is better suited for edge weight/strength encoding.
- **Color picker beyond the 12-color palette** — a free-form color picker is unnecessary; 12 colors exceeds the practical limit of ~8 distinguishable hues.

## Further Notes

- The research recommends a maximum of ~5 colorblind-safe simultaneous edge type colors. At 12 palette colors, users creating many edge types will exceed perceptual limits. This is acceptable — the follow-up features (edge type filtering, dash patterns) will address this at scale.
- This feature establishes the visual foundation that all subsequent Tier 1 features build on. Edge type filtering (#2) and stable layout (#3) depend on edges being visually distinguishable first.

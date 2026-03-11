---
status: completed
feature: color-code-edges
created: 2026-03-11
completed: 2026-03-11
---

# Plan: Color-Code Edges by Type

> Source PRD: plans/improve-viewer/color-code-edges/prd.md

## Architectural Decisions

- **Schema**: Add `color TEXT` column to `edge_types` table. Nullable, mirrors `node_types.color`.
- **Color palette**: Extract the 12-color Tailwind palette into a shared utility used by both node type and edge type components. Auto-assign rotates through palette colors not yet used by other edge types in the same graph.
- **Rendering**: Edge stroke color and arrow marker color both come from edge type color. Fallback: `#94a3b8` (current gray).
- **View-data**: No API changes — the endpoint already returns all edge type columns via `SELECT *`.

---

## Phase 1: End-to-End Color Rendering

**User stories**: 1 (colored edges), 2 (colored arrow markers), 7 (existing edge types get colors), 8 (tooltip color reinforcement)

### What to build

The thinnest vertical slice that makes edge colors visible. Add the `color` column to the database with a migration that auto-assigns colors to existing edge types. Update shared schemas to include color. Update the API create handler to auto-assign colors when none provided. Pass edge type color through GraphCanvas to GraphEdge, which renders the stroke and arrow marker in that color. Add a small color indicator to the edge tooltip.

### Acceptance criteria

- [ ] New migration adds `color` column to `edge_types` and auto-assigns palette colors to existing rows (grouped per graph)
- [ ] Shared Zod schemas include `color` on edge type create, update, and read schemas
- [ ] API POST for edge types auto-assigns a palette color when no color is provided
- [ ] API PATCH for edge types accepts color updates
- [ ] GraphCanvas passes edge type color into GraphEdge data
- [ ] GraphEdge renders stroke in the edge type's color (fallback to #94a3b8)
- [ ] Directed edge arrow markers match the edge type color
- [ ] Edge tooltip shows a color indicator next to the edge type name

---

## Phase 2: User Controls and Visual Polish

**User stories**: 3 (sidebar colored dots), 4 (auto-assign from palette), 5 (pick color on create), 6 (change color after creation)

### What to build

Extract the color palette into a shared utility module. Add colored dot indicators to edge type links in the sidebar. Add a color picker (palette grid) to the create and edit edge type dialogs, using the same component pattern as node types. Ensure auto-assign picks the next unused palette color.

### Acceptance criteria

- [ ] Color palette extracted to a shared utility; both node type and edge type UIs import from it
- [ ] Sidebar edge type links show a colored dot matching the edge type's color
- [ ] Create edge type dialog includes a color picker (palette grid)
- [ ] Edit edge type form includes a color picker (palette grid)
- [ ] Auto-assign selects the first palette color not already used by another edge type in the same graph
- [ ] Clearing color in the edit form falls back to auto-assigned behavior on next create

---
status: completed
archived: 2026-03-11
---

# Lattice — PRD

## Problem Statement

There is no lightweight, self-hostable tool that lets users define their own graph data models (node types, edge types, custom fields) and interact with that data through a spreadsheet-like table view, a visual graph view, a REST API, and a CLI. Existing graph databases are too technical for non-engineers, and existing no-code tools don't expose graph structure or offer programmatic access for AI agents. Users need a flexible "graph spreadsheet" they can shape to any domain — people networks, knowledge graphs, system architectures, ontologies — with full API parity so their AI agents can build and query graphs alongside them.

## Solution

Lattice is a web application that lets users define typed nodes and edges with custom field schemas, then create, view, and edit graph data through three interfaces:

1. **Table views** — One editable spreadsheet per node/edge type (Airtable-style), powered by TanStack Table
2. **Graph view** — Interactive visualization of all nodes and edges using React Flow with auto-layout
3. **REST API + CLI** — Full CRUD parity with the UI, authenticated via PAT tokens, with a SKILL.md for AI agent consumption

Users authenticate via email magic link (BetterAuth + Resend). Each user can own multiple graphs (UI starts with one, schema supports many).

## User Stories

### Authentication & Account
1. As a new user, I want to sign up with my email and receive a magic link, so that I can access Lattice without managing a password.
2. As a returning user, I want to sign in via magic link, so that I can securely access my account.
3. As a user, I want to sign out of my session, so that my account is secure on shared devices.
4. As a user, I want to create a PAT token with a custom name, so that I can authenticate my CLI or AI agent.
5. As a user, I want to list all my PAT tokens with their names and creation dates, so that I can manage my access credentials.
6. As a user, I want to revoke a specific PAT token, so that I can disable access if a token is compromised.

### Graph Management
7. As a user, I want to create a new graph with a name and optional description, so that I can organize different domains of data.
8. As a user, I want to see a list of graphs I own, so that I can navigate between them.
9. As a user, I want to rename or update the description of a graph I own, so that I can keep my workspace organized.
10. As a user, I want to delete a graph I own, so that I can clean up unused data.

### Node Type & Field Definitions
14. As a user, I want to create a node type (e.g., "Person", "Organization") with a name and optional color/icon, so that I can model my domain.
15. As a user, I want to add fields to a node type, choosing from predefined types (text, number, boolean, date, url, email, select, multi_select, json), so that I can define the shape of my data.
16. As a user, I want to reorder fields on a node type, so that the table columns appear in a logical order.
17. As a user, I want to rename a field on a node type, so that I can fix naming mistakes.
18. As a user, I want to delete a field from a node type, so that I can simplify my schema (existing data for that field is dropped).
19. As a user, I want to define options for select and multi_select fields, so that I can constrain values to a known set.
20. As a user, I want to edit a node type's name, color, or icon, so that I can refine my model over time.
21. As a user, I want to delete a node type (and all its nodes and connected edges), so that I can restructure my graph.

### Edge Type & Field Definitions
22. As a user, I want to create an edge type (e.g., "knows", "reports_to") with a name, directionality (directed or undirected), and source/target node type constraints, so that I can define relationships.
23. As a user, I want to add custom fields to an edge type (same field types as nodes), so that I can attach metadata to relationships.
24. As a user, I want to reorder, rename, or delete fields on an edge type, so that I can refine my relationship schema.
25. As a user, I want to edit an edge type's name or directionality, so that I can correct my model.
26. As a user, I want to delete an edge type (and all its edges), so that I can restructure my graph.
27. As a user, I want to specify which node types an edge type can connect (e.g., "employs" goes from Organization to Person), so that I can enforce structural constraints.

### Node CRUD
28. As a user, I want to create a node of a given type, filling in its fields, so that I can populate my graph.
29. As a user, I want to view all nodes of a specific type in a table with columns matching the type's fields, so that I can see my data in a structured way.
30. As a user, I want to edit a node's field values inline in the table, so that I can quickly update data.
31. As a user, I want to delete a node (and its connected edges), so that I can remove outdated data.
32. As a user, I want to sort the node table by any column, so that I can find data quickly.
33. As a user, I want to filter the node table by field values, so that I can focus on a subset of data.

### Edge CRUD
34. As a user, I want to create an edge between two nodes, selecting the edge type and filling in its fields, so that I can define relationships.
35. As a user, I want to view all edges of a specific type in a table with source, target, and custom field columns, so that I can inspect relationships.
36. As a user, I want to edit an edge's field values inline in the table, so that I can update relationship metadata.
37. As a user, I want to delete an edge, so that I can remove a relationship.
38. As a user, I want to sort and filter the edge table by any column, so that I can find specific relationships.
39. As a user, I want to see the source and target node names (not just IDs) in the edge table, so that the data is human-readable.

### Graph View
40. As a user, I want to see all nodes and edges rendered as an interactive graph using auto-layout, so that I can visualize the structure of my data.
41. As a user, I want nodes in the graph to be visually differentiated by type (color/icon), so that I can quickly identify categories.
42. As a user, I want to hover over a node in the graph to see its field values in a tooltip/popover, so that I can inspect data without leaving the view.
43. As a user, I want to hover over an edge in the graph to see its type and field values, so that I can inspect relationships.
44. As a user, I want directed edges to show arrows and undirected edges to show plain lines, so that directionality is clear.
45. As a user, I want to pan and zoom the graph view, so that I can navigate large graphs.
46. As a user, I want the graph to re-layout when nodes/edges are added or removed, so that the visualization stays clean.

### Import / Export
47. As a user, I want to export all nodes of a given type as a CSV file, so that I can use the data in other tools.
48. As a user, I want to export all edges of a given type as a CSV file, so that I can share relationship data.
49. As a user, I want to import nodes from a CSV file into a specific node type, so that I can bulk-load data.
50. As a user, I want to import edges from a CSV file into a specific edge type (matching source/target by node ID or a designated lookup field), so that I can bulk-load relationships.
51. As a user, I want import errors (missing required fields, type mismatches) reported clearly, so that I can fix my CSV and retry.

### REST API
52. As a developer, I want full CRUD endpoints for graphs, node types, edge types, nodes, and edges, so that I can integrate Lattice into my workflows.
53. As a developer, I want to authenticate API requests with a PAT token in the Authorization header, so that I can access my data programmatically.
54. As a developer, I want cursor-based paginated list endpoints, so that I can efficiently iterate over large datasets.
55. As a developer, I want to filter nodes and edges by field values via query parameters, so that I can retrieve specific subsets.
56. As a developer, I want bulk create/update/delete endpoints for nodes and edges, so that I can perform batch operations efficiently.
57. As a developer, I want consistent error responses with status codes and messages, so that I can handle errors programmatically.
58. As a developer, I want the API to validate field values against the type's field definitions, so that I get clear errors on bad input.

### CLI
59. As a CLI user, I want to configure my API URL and PAT token via `lattice config set`, so that I can authenticate once and run commands.
60. As a CLI user, I want commands for all CRUD operations (e.g., `lattice nodes create --type Person --data '{"name":"Alice"}'`), so that I have full parity with the UI.
61. As a CLI user, I want `lattice nodes list --type Person --filter 'name[contains]=Alice'` to query nodes, so that I can script data retrieval.
62. As a CLI user, I want `lattice import nodes --type Person --file people.csv` and `lattice export nodes --type Person`, so that I can bulk-load and extract data.
63. As a CLI user, I want `lattice graphs list` and `lattice graphs use <id>` to switch context, so that I can work across multiple graphs.
64. As a CLI user, I want human-readable table output by default and `--json` for machine-readable output, so that the CLI works for both humans and scripts.

### SKILL.md / AI Agent
65. As an AI agent, I want a SKILL.md that documents all CLI commands with examples, so that I can use Lattice without human guidance.
66. As an AI agent, I want the CLI to support `--json` output on all commands, so that I can parse responses reliably.
67. As an AI agent, I want to compose CLI commands (e.g., list nodes, filter, then update) to perform complex graph operations, so that I can build sophisticated workflows.

## Implementation Decisions

### Architecture
- **Monorepo** using pnpm workspaces with `packages/api`, `packages/web`, `packages/cli`, and `packages/shared` (shared types/validation)
- **API**: Cloudflare Worker with Hono (lightweight, Workers-native router)
- **Database**: Cloudflare D1 (SQLite)
- **Frontend**: Vite + React + TypeScript + Tailwind CSS + shadcn/ui + TanStack Table + TanStack Router
- **Graph View**: React Flow with dagre or elk for auto-layout
- **Auth**: BetterAuth with email magic link via Resend
- **CLI**: Node.js CLI published as `@lattice/cli`

### Database Schema (Hybrid Approach)
The schema uses relational tables for structure definitions (types, fields) and JSON columns for flexible data storage.

**Core tables:**
- `users` — managed by BetterAuth
- `sessions` — managed by BetterAuth
- `pat_tokens` — id, user_id, name, token_hash, created_at, last_used_at
- `graphs` — id, name, description, created_by, created_at, updated_at
- `node_types` — id, graph_id, name, slug, color, icon, display_field_slug (nullable FK to node_type_fields), created_at, updated_at
- `node_type_fields` — id, node_type_id, name, slug, field_type, ordinal, required (boolean, default false), config (JSON — e.g., select options), created_at, updated_at
- `edge_types` — id, graph_id, name, slug, directed (boolean), source_node_type_id, target_node_type_id, created_at, updated_at
- `edge_type_fields` — id, edge_type_id, name, slug, field_type, ordinal, required (boolean, default false), config (JSON), created_at, updated_at
- `nodes` — id, graph_id, node_type_id, data (JSON), created_at, updated_at
- `edges` — id, graph_id, edge_type_id, source_node_id, target_node_id, data (JSON), created_at, updated_at

**Key constraints:**
- Edges cannot be self-referencing (source_node_id != target_node_id) — enforced at API layer
- If edge_type has source/target node type constraints, validate at API layer
- Deleting a node cascades to delete connected edges (ON DELETE CASCADE)
- Deleting a node type cascades to delete its nodes (and their edges)
- Deleting an edge type cascades to delete its edges
- Hard delete (no soft delete for v1)

### Data Validation
- Field values in `data` JSON are validated at the API layer against `node_type_fields`/`edge_type_fields` definitions
- Unknown fields in `data` are rejected (strict validation) — this keeps data clean and prevents typos from silently succeeding
- The `packages/shared` package contains Zod schemas for field type validation, shared between API and frontend

### API Design
- Base path: `/api/v1`
- Auth: `Authorization: Bearer <pat_token>` or session cookie
- Resources: `/graphs`, `/graphs/:graphId/node-types`, `/graphs/:graphId/edge-types`, `/graphs/:graphId/nodes`, `/graphs/:graphId/edges`
- Pagination: cursor-based using `?cursor=<id>&limit=50`
- Filtering: query params like `?filter[field_slug][op]=value` (operators: eq, contains, is_null)
- Bulk operations: `POST /graphs/:graphId/nodes/bulk` with array body
- CSV import/export: `POST /graphs/:graphId/nodes/import?type=<nodeTypeId>` (multipart form), `GET /graphs/:graphId/nodes/export?type=<nodeTypeId>` (returns CSV)

### Frontend Routing (TanStack Router)
- `/` — Dashboard (list graphs)
- `/graphs/:graphId` — Redirects to `/graphs/:graphId/view`
- `/graphs/:graphId/nodes/:nodeTypeSlug` — Table view for a node type
- `/graphs/:graphId/edges/:edgeTypeSlug` — Table view for an edge type
- `/graphs/:graphId/view` — Graph visualization
- `/graphs/:graphId/settings` — Graph settings, types
- `/settings` — User settings, PAT token management

### CLI Structure
- Config stored at `~/.lattice/config.json` with `api_url` and `token`
- Commands: `lattice config set`, `lattice graphs list|create|use|delete`, `lattice node-types list|create|update|delete`, `lattice edge-types list|create|update|delete`, `lattice nodes list|create|update|delete`, `lattice edges list|create|update|delete`, `lattice import`, `lattice export`
- All commands support `--json` flag
- Default output is formatted tables (using a library like `cli-table3` or similar)

### Modules

1. **packages/shared** — Zod schemas for field types, validation logic, TypeScript types for all entities, shared constants
2. **packages/api** — Cloudflare Worker with Hono. Sub-modules: auth middleware, graph routes, node-type routes, edge-type routes, node routes, edge routes, CSV import/export, PAT token management
3. **packages/web** — React SPA. Sub-modules: auth pages, graph dashboard, type schema editor, node table view, edge table view, graph visualization view, settings pages
4. **packages/cli** — Node.js CLI. Sub-modules: config management, API client (wraps fetch calls to the API), command definitions

## Testing Decisions

Good tests verify external behavior through public interfaces, not implementation details. Tests should be resilient to refactoring — if the behavior doesn't change, the test shouldn't break.

### What to test:
- **packages/shared** — Unit tests for Zod validation schemas (field type validation, edge constraint validation). These are pure functions with clear inputs/outputs.
- **packages/api** — Integration tests for each route group using Miniflare (Cloudflare's local Worker runtime). Test full request/response cycles: auth, CRUD operations, validation errors, cascade deletes, pagination, filtering, CSV import/export.
- **packages/cli** — Light integration tests that mock the API client and verify command parsing and output formatting.
- **packages/web** — No automated tests for v1. The UI is the test surface during development.

### Test tooling:
- Vitest for all packages
- Miniflare for Worker integration tests
- No E2E/browser tests for v1

## Out of Scope

- Graph algorithms (shortest path, centrality, clustering, community detection)
- Real-time collaboration (WebSockets, presence, conflict resolution)
- Multiple graphs in the UI (schema supports it, UI shows one graph at a time initially)
- Graph filtering, clustering, or advanced visualization controls in the graph view
- Rich text or markdown fields
- File or image attachments on nodes/edges
- Webhooks or event system
- Self-referencing edges
- Audit trail / change history
- Soft delete
- Onboarding flow
- Social login (Google, GitHub)
- Mobile-responsive design (desktop-first)
- Graph sharing / collaboration (inviting other users to a graph)
- Pending invite flow
- Node position persistence in graph view (auto-layout only)
- Editing nodes/edges from within the graph view

## Further Notes

- **D1 performance**: Monitor query performance as graphs grow. The JSON `data` column approach avoids complex JOINs but limits server-side filtering. If filtering becomes a bottleneck, consider adding a `node_field_index` table with extracted values for commonly filtered fields.
- **React Flow limits**: React Flow handles ~500 nodes well. For larger graphs, we may need to switch to a canvas-based renderer (Sigma.js, Cytoscape.js) or implement viewport culling. This is a known future consideration.
- **Future multi-graph UI**: The schema is designed with `graph_id` on all tables. When we add multi-graph UI, no schema migration is needed — just UI work.
- **Future sharing**: The schema can be extended with a `graph_members` table to support graph sharing and role-based access (viewer, editor, collaborator) when needed.
- **CLI as SKILL.md**: The SKILL.md will document all CLI commands with examples, input/output formats, and common workflows (e.g., "create a Person node type, add fields, then bulk-import from CSV"). This enables AI agents to use Lattice as a graph-building tool.

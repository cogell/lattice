# Plan: Lattice Implementation

> Source PRD: [PRD.md](../PRD.md)

## Architectural decisions

Durable decisions that apply across all phases:

- **Monorepo**: pnpm workspaces with `packages/api`, `packages/web`, `packages/cli`, `packages/shared`
- **API**: Cloudflare Worker with Hono, base path `/api/v1`
- **Database**: Cloudflare D1 (SQLite). Hybrid schema — relational tables for structure definitions, JSON `data` columns for flexible node/edge field storage
- **ID generation**: ULID via [`ulid-workers`](https://github.com/ryan-mars/ulid-workers), monotonic ULIDs safe for Cloudflare Workers' frozen `Date.now()`. 26-character, lexicographically sortable by creation time
- **Auth**: BetterAuth with email magic link via Resend. PAT tokens for API/CLI auth (`Authorization: Bearer <token>`). If BetterAuth's D1 adapter proves unreliable, fall back to minimal custom auth (magic link via Resend, session table, cookie management)
- **Frontend**: Vite + React + TypeScript + Tailwind CSS + shadcn/ui + TanStack Table + TanStack Router
- **Graph visualization**: React Flow with [`@dagrejs/dagre`](https://www.npmjs.com/package/@dagrejs/dagre) for auto-layout
- **CLI**: Node.js, config stored at `~/.lattice/config.json`
- **Testing**: Vitest for all packages. Miniflare for API integration tests. No frontend tests for v1
- **Production serving**: single Cloudflare Worker serves both the API (`/api/v1`) and the SPA via [Workers Assets](https://developers.cloudflare.com/workers/static-assets/)
- **Local development**: Vite dev server proxies `/api/v1` requests to the local wrangler dev server
- **UI routes**: `/` (dashboard), `/graphs/:graphId/nodes/:nodeTypeSlug`, `/graphs/:graphId/edges/:edgeTypeSlug`, `/graphs/:graphId/view`, `/graphs/:graphId/settings`, `/settings`
- **`/graphs/:graphId` route**: redirects to `/graphs/:graphId/view`
- **API resources**: `/graphs`, `/graphs/:graphId/node-types`, `/graphs/:graphId/node-types/:id/fields`, `/graphs/:graphId/edge-types`, `/graphs/:graphId/edge-types/:id/fields`, `/graphs/:graphId/nodes`, `/graphs/:graphId/edges`, `/graphs/:graphId/view-data` (defined in Phase 11), `/settings/tokens`
- **Pagination**: cursor-based using `?after=<lastId>&limit=50` (renamed from PRD's `?cursor=` to clarify the value is the last seen ID, not an opaque token). ULIDs are lexicographically sortable, so the last ID serves as the cursor for creation-order pagination. Response shape: `{ data, pagination: { next_cursor, has_more } }`. No total counts
- **Sorting**: `?sort=<fieldSlug>:asc|desc` on node and edge list endpoints. Default sort is creation order (ULID ascending) when `?sort` is omitted. Uses `json_extract()` on `data` columns (unindexed, same as filtering)
- **Error envelope**: `{ error: { status, message } }`
- **Success envelope**: single-resource: `{ data: {...} }`. Lists: `{ data: [...], pagination }`. Delete: `204 No Content`
- **HTTP status codes**: create -> `201`, update -> `200`, delete -> `204`, auth failure -> `401`, permission failure -> `403`, constraint conflict -> `409`
- **Entity representation**: all responses include full entity with `created_at` and `updated_at`
- **Slug semantics**: node type, edge type, and field slugs are generated on create (snake_case from name, deduped within scope by appending `_2`, `_3`, etc. on collision, truncated to 64 chars), unique within scope, and immutable after creation
- **Field semantics**: field `name` is the editable display label; field `slug` is the immutable storage key in `data` JSON
- **Uniqueness rules**: graph names may repeat; node/edge type names unique within graph; field names unique within type
- **Node display**: each node type may set `display_field_slug` for human-readable labels; if unset, falls back to node ID
- **Ownership model**: each graph has one owner (`created_by`); sharing out of scope for v1
- **Graph ownership middleware**: reusable Hono middleware loads graph by ID, verifies owner, attaches to context
- **Browser auth model**: same-origin in production (single Worker); Vite proxy in dev. Session cookies: `HttpOnly`, `Secure`, `SameSite=Lax`
- **Deletion strategy**: hard delete, cascade (type -> instances -> connected edges)
- **Edge type constraints**: `source_node_type_id` and `target_node_type_id` are required and immutable after creation
- **Filtering**: `filter[field_slug][op]=value` with operators `eq`, `contains`, `is_null`. Uses `json_extract()` on `data` columns (no index — acceptable for v1)
- **SPA catch-all**: wrangler.toml `not_found_handling = "single-page-application"`
- **Production secrets**: managed via `wrangler secret put`; `.dev.vars` for local dev (gitignored)
- **API client**: `packages/shared` exports a typed API client factory (`createApiClient(baseUrl, getAuthHeader)`) returning methods for each endpoint group. The web app wraps these in TanStack Query hooks; the CLI uses them directly. Response payloads validated with shared Zod schemas
- **Dev auth bypass**: `DEV_AUTH_BYPASS=true` in `.dev.vars` skips auth and injects a deterministic dev user
- **Field types**: text, number, boolean, date, url, email, select, multi_select. The PRD also lists `json` but it is excluded from v1 to keep validation and UI rendering simple
- **Excluded from v1**: bulk create/update/delete endpoints (PRD story 56) — CSV import covers batch needs for now. Edge CSV import matches by node ID only (PRD story 50 also mentions "designated lookup field" — deferred)

> **Note:** PRD user stories skip from 10 to 14 (11-13 were removed during PRD development). Some user stories appear in two phases — once for the API (Phases 2-7) and again for the UI (Phases 8-11). This is intentional: the API phase builds the endpoint, the UI phase builds the frontend for the same capability.

---

## Phase 1: Monorepo Scaffold, Database & Deployment ✅

**Status**: Complete — deployed to https://lattice-api.cogell.workers.dev

**User stories**: 57 (consistent error responses — envelope established here)

### What was built

- pnpm monorepo with 4 packages (api, web, cli, shared)
- D1 migration with all 10 tables, 7 indices, FK cascades
- Hono API with `/api/v1/health` endpoint and error envelope helpers
- Shared Zod field-type schemas (text, number, boolean, date, url, email, select, multi_select)
- Vitest + Miniflare test harness with health smoke test
- Vite + React + Tailwind + shadcn/ui web shell with `/api/v1` proxy
- Workers Assets with ASSETS binding for SPA catch-all
- Deployed and verified: health endpoint, SPA root, SPA catch-all all working

---

## Phase 2: Auth & PAT Tokens API ✅

**Status**: Complete

**User stories**: 1, 2, 3, 4, 5, 6, 53

### What was built

- BetterAuth configured with Kysely D1 adapter, CamelCasePlugin for snake_case column mapping, and magic link plugin via Resend
- Migration `0002_better_auth.sql` adds `email_verified`/`image` to users, renames `token_hash` → `token` in sessions, adds `ip_address`/`user_agent`/`updated_at`, creates `account` and `verification` tables
- Auth middleware with 3-tier check: DEV_AUTH_BYPASS → session cookie → Bearer token → 401
- DEV_AUTH_BYPASS auto-inserts dev user row (INSERT OR IGNORE) so FK constraints work
- PAT token CRUD: `lat_` prefix + 128-bit entropy, SHA-256 hashed before storage, create (201) / list / delete (204) with validation
- Bearer token auth with `waitUntil` for non-blocking `last_used_at` updates
- `nodejs_compat` flag added to wrangler.toml for BetterAuth's `node:async_hooks` dependency
- Vite proxy updated to forward `/api/auth` to Workers dev server
- 14 integration tests (auth middleware, PAT CRUD, Bearer auth) all passing
- Test setup applies D1 migrations via `batch()` (D1's `exec()` has issues with comments/PRAGMA in test env)

### Acceptance criteria

- [x] Magic link sign-up and sign-in flow works end-to-end
- [x] Session cookie is set on successful auth
- [x] Sign-out endpoint clears the session
- [x] Auth middleware rejects unauthenticated requests with 401
- [x] Auth and validation failures use the error envelope
- [x] `DEV_AUTH_BYPASS=true` skips auth and injects a deterministic dev user
- [x] `POST /api/v1/settings/tokens` creates a PAT, returns raw token once, stores hash, returns `201`
- [x] `GET /api/v1/settings/tokens` lists tokens (name, dates — not hash)
- [x] `DELETE /api/v1/settings/tokens/:tokenId` revokes a token, returns `204`
- [x] `Authorization: Bearer <token>` authenticates requests and updates `last_used_at`
- [x] Invalid/revoked tokens return 401
- [x] Production secrets configured via `wrangler secret put`
- [x] Integration tests cover auth flow and token lifecycle

---

## Phase 3: Graph CRUD API

**User stories**: 7, 8, 9, 10

### What to build

API routes for graph CRUD. Creator recorded as owner. List returns owned graphs. Build the reusable graph ownership middleware. Build the shared typed API client factory (`createApiClient`) in `packages/shared` with methods for graph endpoints, to be extended in later phases as new route groups are added.

### Acceptance criteria

- [ ] `POST /api/v1/graphs` creates a graph with authenticated user as owner, returns `201`
- [ ] `GET /api/v1/graphs` returns graphs owned by the authenticated user
- [ ] `GET /api/v1/graphs/:graphId` returns graph details (owner only)
- [ ] `PATCH /api/v1/graphs/:graphId` updates name/description (owner only), returns `200`
- [ ] `DELETE /api/v1/graphs/:graphId` deletes graph and all related data, returns `204`
- [ ] Non-owners get 403 on all graph-scoped routes
- [ ] Graph ownership middleware is extracted and reusable
- [ ] `packages/shared` exports `createApiClient(baseUrl, getAuthHeader)` with methods for graph endpoints, validated against shared Zod schemas
- [ ] Integration tests cover CRUD and access control

---

## Phase 4: Type & Field Schema API

**User stories**: 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27

### What to build

API routes for node type and edge type CRUD within a graph. Names are editable display labels; slugs are immutable. Node types have name, color, icon, and optional `display_field_slug`. Edge types have name, directionality, and required source/target node type constraints.

Field CRUD for both node types and edge types: add fields (with type, ordinal, `required`, config for select options), reorder, rename, delete. Field names are editable; slugs are immutable storage keys. Deleting a field prunes that slug from all existing instances; if the deleted field is referenced as a node type's `display_field_slug`, it is nullified. Adding a `required: true` field (or updating an existing field to `required: true`) on a type with existing instances is rejected with 400. Field `field_type` is immutable after creation. Select/multi_select fields accept options in `config`; values are validated against defined options on write. Removing an option is allowed; existing data retains old values. `multi_select` stored as JSON arrays; `select` as plain strings.

Deleting a node type cascades to nodes and connected edges. Deleting an edge type cascades to edges.

### Acceptance criteria

**Node types:**
- [ ] `POST .../node-types` creates with name, color, icon, returns `201`
- [ ] `GET .../node-types` lists all node types for the graph
- [ ] `PATCH .../node-types/:id` updates name, color, icon, or `display_field_slug`, returns `200`
- [ ] `DELETE .../node-types/:id` cascade-deletes type, nodes, and connected edges, returns `204`

**Edge types:**
- [ ] `POST .../edge-types` creates with name, directed flag, source/target node type IDs, returns `201`
- [ ] `GET .../edge-types` lists all edge types for the graph
- [ ] `PATCH .../edge-types/:id` updates name or directionality, returns `200`
- [ ] `source_node_type_id` and `target_node_type_id` are immutable; PATCH rejects changes with 400
- [ ] `DELETE .../edge-types/:id` cascade-deletes type and edges, returns `204`
- [ ] Source/target node type IDs validated to exist in the same graph

**Fields (both node type and edge type):**
- [ ] `POST .../fields` adds a field with name, field_type, ordinal, `required`, and optional config, returns `201`
- [ ] `PATCH .../fields/:id` updates display name, ordinal, `required`, or config without changing slug, returns `200`
- [ ] `DELETE .../fields/:id` removes field and prunes stored values from all instances, returns `204`
- [ ] Deleting a field referenced as `display_field_slug` nullifies it
- [ ] Adding a new `required: true` field, or updating an existing field to `required: true`, on a type with existing instances is rejected with 400
- [ ] `field_type` is immutable; PATCH rejects changes with 400
- [ ] Select/multi_select fields accept options in config
- [ ] Removing a select option is allowed; existing data retains old values
- [ ] Type names unique within graph; field names unique within type
- [ ] Slugs auto-generated, deduped, and immutable
- [ ] `display_field_slug` must reference a field on the same node type
- [ ] Integration tests cover type CRUD, field CRUD, cascade deletes, constraint immutability, and validation

---

## Phase 5: Node & Edge CRUD API

**User stories**: 28, 29, 31, 34, 35, 37, 52, 58

### What to build

API routes for node and edge CRUD. Node `data` validated against field definitions (strict — unknown fields rejected, types checked, required enforced). Edge creation validates source/target exist and match type constraints, rejects self-references. Deleting a node cascades to connected edges. List endpoints return nodes/edges of a given type (pagination and filtering added in Phase 6).

### Acceptance criteria

- [ ] `POST .../nodes` creates with node_type_id and validated data, returns `201`
- [ ] `GET .../nodes?type=<nodeTypeId>` lists nodes of a type
- [ ] `GET .../nodes/:nodeId` returns a single node
- [ ] `PATCH .../nodes/:nodeId` partial-updates data fields, returns `200`
- [ ] `DELETE .../nodes/:nodeId` deletes node and connected edges, returns `204`
- [ ] `POST .../edges` creates with edge_type_id, source/target, and validated data, returns `201`
- [ ] `GET .../edges?type=<edgeTypeId>` lists edges of a type
- [ ] `GET .../edges/:edgeId` returns a single edge
- [ ] `PATCH .../edges/:edgeId` partial-updates data fields, returns `200`
- [ ] `DELETE .../edges/:edgeId` deletes edge, returns `204`
- [ ] Unknown fields, missing required fields on create, and type mismatches rejected with clear errors
- [ ] Select/multi_select values validated against config options
- [ ] Self-referencing edges rejected
- [ ] Edge source/target node type constraints enforced
- [ ] Integration tests cover CRUD, validation, and cascade deletes

---

## Phase 6: Pagination & Filtering

**User stories**: 54, 55

### What to build

Add cursor-based pagination to all list endpoints using ULID sort order (`?after=<lastId>&limit=50`). Add server-side sorting to node and edge lists. Add field-value filtering via `filter[field_slug][op]=value` on node and edge lists using `json_extract()` (no index — acceptable for v1). Supported operators: `eq`, `contains`, `is_null`. The `contains` operator on text fields enables the node picker search in Phase 10.

### Acceptance criteria

- [ ] All list endpoints accept `?after=<id>&limit=<n>` and return `{ data, pagination: { next_cursor, has_more } }`
- [ ] Node and edge lists accept `?sort=<fieldSlug>:asc|desc` for server-side sorting; default is creation order (ULID ascending) when omitted
- [ ] Filters use `filter[field_slug][op]=value` with operators: `eq`, `contains`, `is_null`
- [ ] Node list filtering supports `filter[<slug>][contains]=<term>` for searchable node pickers
- [ ] Integration tests cover pagination boundaries, sorting, and filtering

---

## Phase 7: Import / Export API

**User stories**: 47, 48, 49, 50, 51

### What to build

CSV export endpoints return all nodes/edges of a type as downloadable CSV (headers use field names). CSV import endpoints accept multipart upload (max 5 MB / 5,000 rows), validate all rows against field definitions, and reject the entire batch if any row fails — returning all errors at once so the user can fix and retry. Edge CSV import matches source/target by node ID.

### Acceptance criteria

- [ ] `GET .../nodes/export?type=<nodeTypeId>` returns CSV with field-name headers
- [ ] `GET .../edges/export?type=<edgeTypeId>` returns CSV with source, target, and field columns
- [ ] `POST .../nodes/import?type=<nodeTypeId>` validates all rows, rejects entire batch on any error
- [ ] `POST .../edges/import?type=<edgeTypeId>` validates and imports edges, matching source/target by node ID
- [ ] Import errors (missing fields, type mismatches, constraint violations) returned per-row with clear messages
- [ ] Files exceeding 5 MB or 5,000 rows rejected before processing
- [ ] Integration tests cover export round-trips, import validation, and batch rejection

---

## Phase 8: Web UI — Auth, Dashboard & Graph Management

**User stories**: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10

### What to build

Set up the React SPA with Vite, TanStack Router, Tailwind, and shadcn/ui. App shell with header bar (app name, graph selector, settings link). Auth pages (magic link). Dashboard at `/` with graph list and create/edit/delete. `/graphs/:graphId` redirects to `/graphs/:graphId/view`. Settings page at `/settings` with PAT token management. Graph settings page shell at `/graphs/:graphId/settings`.

### Acceptance criteria

- [ ] App shell renders header bar with navigation
- [ ] Magic link sign-in/sign-up works in browser
- [ ] Unauthenticated users redirected to sign-in
- [ ] Dashboard lists owned graphs
- [ ] User can create, edit, and delete graphs
- [ ] `/graphs/:graphId` redirects to `/graphs/:graphId/view`
- [ ] Graph settings page renders a shell (schema editor added in Phase 9)
- [ ] User settings page shows PAT tokens with create/revoke

---

## Phase 9: Web UI — Schema Editor

**User stories**: 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27

### What to build

Schema editor within graph settings. Create, edit, delete node types (name, color, icon, display field). Field CRUD with `required` and select option config. Edge types with directionality and source/target constraints. Field slugs hidden from UI.

### Acceptance criteria

- [ ] User can create, edit, and delete node types
- [ ] User can add, reorder, rename, and delete fields (all supported types)
- [ ] User can configure `required` and select/multi_select options
- [ ] Field slugs treated as internal; rename updates label only
- [ ] User can set which field provides the display label
- [ ] User can create, edit, and delete edge types (with source/target constraints)
- [ ] Edge type field CRUD mirrors node type field CRUD
- [ ] Deleting a type shows cascade confirmation

---

## Phase 10: Web UI — Node & Edge Table Views

**User stories**: 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39

### What to build

Table views using TanStack Table. Node table at `/graphs/:graphId/nodes/:nodeTypeSlug` with inline editing, server-driven sorting, and filtering. Edge table at `/graphs/:graphId/edges/:edgeTypeSlug` with source/target display labels. Searchable node picker for edge creation using `filter[<slug>][contains]=<term>`. Sidebar nav listing types. Import/export buttons.

### Acceptance criteria

- [ ] Node table displays columns matching field definitions
- [ ] User can create, inline-edit, and delete nodes
- [ ] Node table supports server-side sorting and field-value filtering
- [ ] Edge table displays source/target labels and custom fields
- [ ] Edge table supports inline editing, sorting, and filtering
- [ ] Edge creation uses searchable node picker
- [ ] Sidebar nav lists all types with links to table views
- [ ] Import/export buttons for CSV upload/download

---

## Phase 11: Web UI — Graph Visualization

**User stories**: 40, 41, 42, 43, 44, 45, 46

### What to build

`GET /api/v1/graphs/:graphId/view-data` returns all nodes and edges un-paginated, capped at 1,000 nodes / 5,000 edges (with `truncated: true` if exceeded). Graph view at `/graphs/:graphId/view` using React Flow + dagre auto-layout. Nodes colored by type with icons. Directed edges show arrows. Hover tooltips for nodes and edges. Re-layout on data changes.

### Acceptance criteria

- [ ] View-data endpoint returns all nodes/edges capped at 1,000/5,000 with truncation flag
- [ ] Nodes and edges render with dagre auto-layout
- [ ] Nodes colored with icons by type
- [ ] Directed edges show arrows; undirected show plain lines
- [ ] Hover shows field values (nodes) and type + fields (edges)
- [ ] Pan and zoom work smoothly
- [ ] Data changes trigger re-layout

---

## Phase 12: CLI + SKILL.md

**User stories**: 59, 60, 61, 62, 63, 64, 65, 66, 67

### What to build

Node.js CLI in `packages/cli`. `lattice config set` stores API URL and PAT token. Commands for all CRUD operations, import/export CSV. All commands support `--json`. Filter syntax: `--filter 'field_slug[op]=value'` (operators: `eq`, `contains`, `is_null`). Uses the shared `createApiClient` from `packages/shared` for all API calls. Write SKILL.md documenting all commands with examples for AI agent consumption.

### Acceptance criteria

- [ ] `lattice config set --api-url <url> --token <token>` persists config
- [ ] `lattice graphs list|create|update|use|delete` work
- [ ] `lattice graphs use <id>` persists the active graph ID in `~/.lattice/config.json`; subsequent type/node/edge commands default to it
- [ ] Full CRUD commands for node types, edge types, nodes, and edges
- [ ] `lattice nodes list --type <slug> --filter 'field[eq]=value'` filters results
- [ ] `lattice import nodes --type <slug> --file <path>` imports CSV
- [ ] `lattice export nodes --type <slug>` outputs CSV
- [ ] `--json` flag on all commands
- [ ] SKILL.md documents every command with usage, flags, and examples
- [ ] SKILL.md includes common workflows using `--json` output
- [ ] Light integration tests verify command parsing and output formatting

# API Reference

Base URL: `/api/v1`

## Authentication

All endpoints except `GET /health` require authentication via one of:

- **Session cookie** — set by BetterAuth after magic link sign-in
- **Bearer token** — `Authorization: Bearer lat_<hex>` using a PAT token

In local dev with `DEV_AUTH_BYPASS=true`, auth is skipped and a deterministic dev user is injected.

## Response format

**Success (single resource)**:
```json
{ "data": { ... } }
```

**Success (list)**:
```json
{
  "data": [ ... ],
  "pagination": { "total": 42, "limit": 50, "offset": 0, "has_more": false }
}
```

**Delete**: `204 No Content` (empty body)

**Error**:
```json
{ "error": { "status": 400, "message": "..." } }
```

**Import error** (includes per-row details):
```json
{
  "error": {
    "status": 400,
    "message": "Import validation failed",
    "details": [{ "row": 1, "field": "email", "message": "Invalid email" }]
  }
}
```

## Pagination

All list endpoints accept:

| Param | Default | Max | Description |
|-------|---------|-----|-------------|
| `limit` | 50 | 100 | Items per page |
| `offset` | 0 | — | Items to skip |

## Sorting

Node and edge list endpoints accept `?sort=<fieldSlug>:asc|desc` when `?type=<typeId>` is provided. Default is creation order (ULID ascending).

## Filtering

Node and edge list endpoints accept `?filter[<fieldSlug>][<op>]=<value>` when `?type=<typeId>` is provided.

| Operator | Description | Field types |
|----------|-------------|-------------|
| `eq` | Exact match | All |
| `contains` | Substring match | Text only |
| `is_null` | Null check (`true`/`false`) | All |

---

## Health

### `GET /health`

No auth required. Returns `{ "status": "ok" }`.

---

## Graphs

### `POST /graphs`

Create a graph. The authenticated user becomes the owner.

**Body**: `{ "name": string, "description"?: string }`

**Response**: `201` with graph object.

### `GET /graphs`

List graphs owned by the authenticated user. Paginated.

### `GET /graphs/:graphId`

Get a single graph. Owner only (403 for non-owners).

### `PATCH /graphs/:graphId`

Update graph name or description.

**Body**: `{ "name"?: string, "description"?: string }`

**Response**: `200` with updated graph.

### `DELETE /graphs/:graphId`

Delete graph and cascade to all node types, edge types, nodes, edges, and field definitions.

**Response**: `204`

---

## Node Types

All routes scoped to `/graphs/:graphId/node-types`. Owner only.

### `POST /node-types`

**Body**: `{ "name": string, "color"?: string, "icon"?: string }`

Name must be unique within the graph. Slug auto-generated from name (immutable).

**Response**: `201`

### `GET /node-types`

List all node types for the graph. Ordered by creation time.

### `GET /node-types/:id`

Get a single node type.

### `PATCH /node-types/:id`

**Body**: `{ "name"?: string, "color"?: string | null, "icon"?: string | null, "display_field_slug"?: string | null }`

- `display_field_slug` must reference an existing field slug on this type (or `null` to clear)
- Name must remain unique within the graph

**Response**: `200`

### `DELETE /node-types/:id`

Cascade deletes: node type → fields, nodes of this type, edges connected to those nodes, and edge types that reference this type as source or target.

**Response**: `204`

---

## Node Type Fields

All routes scoped to `/graphs/:graphId/node-types/:nodeTypeId/fields`. Owner only.

### `POST /fields`

**Body**:
```json
{
  "name": string,
  "field_type": "text" | "number" | "boolean" | "date" | "url" | "email" | "select" | "multi_select",
  "ordinal": number,
  "required"?: boolean,
  "config"?: { "options": string[] }  // required for select/multi_select
}
```

Name must be unique within the node type. Slug auto-generated (immutable). `field_type` is immutable after creation.

**Response**: `201`

### `GET /fields`

List fields ordered by `ordinal ASC`.

### `PATCH /fields/:fieldId`

**Body**: `{ "name"?: string, "ordinal"?: number, "required"?: boolean, "config"?: object }`

- `field_type` cannot be changed (400)
- Cannot set `required: true` when nodes of this type exist (400)

**Response**: `200`

### `DELETE /fields/:fieldId`

Deletes the field definition and **prunes the field slug from the `data` JSON of all nodes** of this type. If the deleted field's slug matches the node type's `display_field_slug`, it is set to `null`.

**Response**: `204`

---

## Edge Types

All routes scoped to `/graphs/:graphId/edge-types`. Owner only.

### `POST /edge-types`

**Body**: `{ "name": string, "directed"?: boolean, "source_node_type_id": string, "target_node_type_id": string }`

Source and target node type IDs must exist in the same graph. Slug auto-generated (immutable).

**Response**: `201`

### `GET /edge-types`

List all edge types for the graph.

### `GET /edge-types/:id`

Get a single edge type.

### `PATCH /edge-types/:id`

**Body**: `{ "name"?: string, "directed"?: boolean }`

`source_node_type_id` and `target_node_type_id` are immutable (400 if included).

**Response**: `200`

### `DELETE /edge-types/:id`

Cascade deletes the edge type and all its edges.

**Response**: `204`

---

## Edge Type Fields

All routes scoped to `/graphs/:graphId/edge-types/:edgeTypeId/fields`. Same interface as node type fields.

### `POST /fields`

Same body and behavior as node type fields.

### `GET /fields`

List fields ordered by `ordinal ASC`.

### `PATCH /fields/:fieldId`

Same constraints as node type fields (immutable `field_type`, cannot make required with existing edges).

### `DELETE /fields/:fieldId`

Prunes field slug from all edge `data` JSON.

**Response**: `204`

---

## Nodes

All routes scoped to `/graphs/:graphId/nodes`. Owner only.

### `POST /nodes`

**Body**: `{ "node_type_id": string, "data": { [fieldSlug]: value } }`

Data is validated against field definitions: unknown fields rejected, types checked, required fields enforced, select/multi_select values checked against config options.

**Response**: `201`

### `GET /nodes`

List nodes. Supports `?type=<nodeTypeId>` filter, pagination, sorting, and filtering.

### `GET /nodes/:nodeId`

Get a single node with parsed `data`.

### `PATCH /nodes/:nodeId`

**Body**: `{ "data": { [fieldSlug]: value } }`

Merges with existing data. Validates against field definitions.

**Response**: `200`

### `DELETE /nodes/:nodeId`

Deletes the node and all connected edges (as source or target).

**Response**: `204`

---

## Node Import/Export

### `GET /nodes/export?type=<nodeTypeId>`

Export all nodes of a type as CSV. Headers use field **names** (not slugs). Returns `Content-Type: text/csv`.

### `POST /nodes/import?type=<nodeTypeId>`

Import nodes from CSV. Accepts `multipart/form-data` with a `file` field.

- Max file size: 5 MB
- Max rows: 5,000
- All rows validated before any are inserted — entire batch rejected on any error
- Headers must match field names

**Response**: `201` with `{ "data": { "imported": number } }`

---

## Edges

All routes scoped to `/graphs/:graphId/edges`. Owner only.

### `POST /edges`

**Body**:
```json
{
  "edge_type_id": string,
  "source_node_id": string,
  "target_node_id": string,
  "data": { [fieldSlug]: value }
}
```

Validates: edge type exists in graph, source/target nodes exist in graph, source/target node types match edge type constraints, self-references rejected, data validated against field definitions.

**Response**: `201`

### `GET /edges`

List edges. Supports `?type=<edgeTypeId>` filter, pagination, sorting, and filtering.

### `GET /edges/:edgeId`

Get a single edge.

### `PATCH /edges/:edgeId`

**Body**: `{ "data": { [fieldSlug]: value } }`

Merges with existing data.

**Response**: `200`

### `DELETE /edges/:edgeId`

**Response**: `204`

---

## Edge Import/Export

### `GET /edges/export?type=<edgeTypeId>`

Export all edges of a type as CSV. Includes `id`, `source_node_id`, `target_node_id`, and field columns.

### `POST /edges/import?type=<edgeTypeId>`

Import edges from CSV. Same constraints as node import (5 MB, 5,000 rows, batch rejection). Additionally validates source/target node IDs exist and match type constraints, and rejects self-references.

**Response**: `201` with `{ "data": { "imported": number } }`

---

## PAT Tokens

All routes under `/settings/tokens`. Auth required.

### `POST /settings/tokens`

**Body**: `{ "name": string }`

Creates a PAT token. The raw token (`lat_<hex>`) is returned **once** in the response and never stored — only the SHA-256 hash is persisted.

**Response**: `201` with `{ "data": { "id", "name", "token", "created_at" } }`

### `GET /settings/tokens`

List the authenticated user's tokens. Returns name, dates — **not** the hash or raw token.

### `DELETE /settings/tokens/:tokenId`

Revoke a token. Must be owned by the authenticated user (403 otherwise).

**Response**: `204`

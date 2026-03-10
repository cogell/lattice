# ADR-003: Batch node fetch endpoint for edge table display

## Status

Accepted

## Context

The edge table view needs to display human-readable labels for source and target nodes. Each edge references a `source_node_id` and `target_node_id`, and the frontend resolves these to display labels using each node type's `display_field_slug`.

The initial implementation used TanStack Query's `useQueries` to fetch each referenced node individually. On a page with 50 edges across 30 unique nodes, this produced 30+ concurrent API calls — an N+1 query problem at the HTTP layer.

Options considered:

- **Inline node labels in edge list response** — avoids extra fetches but couples the edge API to node display logic and inflates response size
- **Client-side `useQueries` with caching** — simple but creates N+1 HTTP requests per page load, even with staleTime
- **Batch fetch endpoint** — single POST with an array of IDs, returns all matching nodes

## Decision

Added `POST /graphs/:graphId/nodes/batch` accepting `{ ids: string[] }` and returning all matching nodes scoped to the graph. Frontend uses a `useBatchNodes(graphId, nodeIds)` hook that sorts IDs for stable cache keys and builds a `Map<string, Node>` for O(1) lookups.

Constraints:
- Max 200 IDs per request (covers 4 pages of edges with unique nodes)
- IDs validated as non-empty strings
- Nodes scoped to graph via `WHERE graph_id = ?`

## Consequences

- Edge table loads node labels in 1 request instead of 30+
- Cache key uses sorted IDs, so reordering doesn't trigger refetch
- The batch endpoint is generic — reusable for any future UI that needs multiple nodes
- No new database index needed (queries by primary key `id` with `graph_id` filter)
- 200-ID limit prevents abuse but may need raising if edge tables grow beyond 4 pages of unique nodes

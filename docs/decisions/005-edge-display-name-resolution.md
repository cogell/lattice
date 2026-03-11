# ADR-005: CLI-side display-name resolution for edge CSV import

## Status

Accepted

## Context

The API's edge import endpoint (`POST /edges/import`) requires `source_node_id` and `target_node_id` columns with raw ULID node IDs. This is correct for the API layer (IDs are unambiguous), but painful for CLI users who work with human-readable names.

For example, a user modeling cocktail recipes wants to write:

```csv
Cocktail,Ingredient,Amount
Old Fashioned,Bourbon,2 oz
```

Not:

```csv
source_node_id,target_node_id,Amount
01KKET830578FBCQWNHM5E8NXP,01KKET830578FBCQWNHM5E8NXB,2 oz
```

An additional challenge arises with same-type edges (e.g., Cocktail → Cocktail for "Variation Of" relationships). Both columns would need the same header name, which causes CSV parsers to deduplicate headers.

## Decision

The CLI resolves display-name columns to node IDs client-side before sending the CSV to the API. The API remains unchanged — it always receives raw IDs.

Resolution logic in `resolveEdgeDisplayNames`:

1. If `source_node_id` and `target_node_id` columns both exist, pass through unchanged.
2. Look up the edge type to get source/target node type IDs.
3. Look up each node type for its name and `display_field_slug`.
4. Match CSV column headers against node type names (case-insensitive):
   - **Different types**: exact match (e.g., `Character`, `Species`)
   - **Same types**: prefixed match required (`Source Cocktail`, `Target Cocktail`)
5. Fetch all nodes of each type, build display-value → ID lookup maps.
6. Rewrite the CSV with `source_node_id` and `target_node_id` columns, preserving any additional data columns.

Errors are aggregated across all rows and reported together.

Ambiguity rules:
- Same-type edges with unprefixed column name → error with guidance to use prefixes
- Both exact and prefixed column for the same side → error (ambiguous)
- Mixed modes allowed (e.g., `Source Cocktail` + `target_node_id`)
- Prefixed columns work for different-type edges too (optional explicitness)

## Consequences

- Users can write edge CSVs with human-readable names instead of ULIDs
- API stays simple — no resolution logic needed server-side
- Requires `display_field_slug` to be set on relevant node types
- Display field values must be unique within a node type (duplicates cause an error)
- Fetches all nodes of each type to build the lookup — acceptable for v1 scale, may need pagination-aware batching for very large datasets
- Same-type edges require the `Source X` / `Target X` prefix convention, which is discoverable via error messages

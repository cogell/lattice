# ADR-001: Hybrid relational + JSON data model

## Status

Accepted

## Context

Lattice lets users define arbitrary node and edge types with custom fields, then store instances of those types. We needed a storage strategy that balances:

1. **Schema flexibility** — users define their own types and fields at runtime
2. **Structural integrity** — types, fields, and relationships need relational constraints (uniqueness, cascading deletes, foreign keys)
3. **Query capability** — filtering and sorting by user-defined field values
4. **Deployment simplicity** — single database, minimal operational overhead

Three approaches were considered:

- **Dedicated graph database** (Neo4j, etc.) — powerful queries but heavy ops burden, no Cloudflare edge deployment
- **Fully schemaless** (document store) — flexible but loses relational integrity for type/field definitions
- **Hybrid relational + JSON** — relational tables for structure, JSON columns for flexible field storage

## Decision

Hybrid relational + JSON using Cloudflare D1 (SQLite).

- **Relational tables** define structure: `node_types`, `edge_types`, `node_type_fields`, `edge_type_fields` with foreign keys, unique constraints, and cascading deletes
- **JSON `data` columns** on `nodes` and `edges` store user-defined field values keyed by field slug
- **Validation at the API layer** — Zod schemas in `packages/shared` validate field values against their type definitions on every write
- **Querying via `json_extract()`** — sorting and filtering use SQLite's `json_extract()` on the `data` column (unindexed, acceptable for v1 scale)

## Consequences

- Simpler ops: single D1 database, no graph DB to manage
- Relational integrity for type definitions (CASCADE deletes, unique constraints)
- No DB-level constraints on field values — application must validate on every write
- `json_extract()` queries are unindexed — acceptable for v1 but may need computed columns or search index at scale
- Field deletion requires pruning the slug from every instance's JSON (batched UPDATE)
- Schema evolution is safe: adding fields doesn't affect existing data; deleting fields prunes stored values

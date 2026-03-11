---
name: lattice
description: CLI for Lattice, a graph database for modeling entities (nodes) and relationships (edges) with user-defined schemas. Use when user mentions lattice CLI, graph data modeling, node/edge CRUD, schema management with types and fields, or CSV import/export of graph data.
---

# Lattice CLI

Graph database CLI for modeling entities and relationships with user-defined schemas.

## Quick start

```bash
# Log in (defaults to production; prompts interactively for token)
lattice login
# Or non-interactively:
lattice login --token <pat-token>
# Or point at a local dev server:
lattice login --api-url http://localhost:8787/api/v1 --token <pat-token>

# Create a graph and set it as active context
lattice graphs create --name "My Graph" --json | jq -r '.id' | xargs lattice graphs use

# Define a node type with fields
lattice node-types create --name "Person" --color "#4A90D9" --icon "user"
PERSON=$(lattice node-types list --json | jq -r '.data[0].id')
lattice node-types fields create --type $PERSON --name "Name" --field-type text --required
lattice node-types fields create --type $PERSON --name "Email" --field-type email

# Create a node
lattice nodes create --type $PERSON --data '{"name": "Alice", "email": "alice@example.com"}'
```

## Core concepts

```
Graph
├── Node Types (schema for entities)
│   └── Fields (text, number, boolean, date, url, email, select, multi_select)
├── Edge Types (schema for relationships, with source/target node type constraints)
│   └── Fields
├── Nodes (instances of a node type, data stored as JSON keyed by field slug)
└── Edges (instances of an edge type, connecting source → target nodes)
```

- **Graph context**: `lattice graphs use <id>` sets active graph; all type/node/edge commands use it. Override with `--graph <id>`.
- **Slugs**: Auto-generated from names (snake_case), immutable. Used as keys in `--data` JSON and `--filter`/`--sort`.
- **Display field**: A node type can set `display_field_slug` for human-readable labels.
- **Cascade deletes**: Deleting a type removes its instances. Deleting a node removes connected edges.

## Workflows

### Model a domain

```bash
lattice graphs create --name "Org Chart" --json | jq -r '.id' | xargs lattice graphs use
lattice node-types create --name "Person" --color "#4A90D9" --icon "user"
lattice node-types create --name "Team" --color "#50C878" --icon "users"
PERSON=$(lattice node-types list --json | jq -r '.data[0].id')
TEAM=$(lattice node-types list --json | jq -r '.data[1].id')
lattice node-types fields create --type $PERSON --name "Full Name" --field-type text --required
lattice node-types fields create --type $PERSON --name "Role" --field-type select --options "Engineer,Designer,Manager"
lattice edge-types create --name "Member Of" --source-type $PERSON --target-type $TEAM --directed
```

### Import/export CSV

```bash
lattice import nodes --type $PERSON --file people.csv        # headers = field display names
lattice import edges --type $EDGE_TYPE --file relations.csv  # use node type names as headers
lattice export nodes --type $PERSON --output backup.csv      # or omit --output for stdout
```

Edge import resolves display names to node IDs automatically. Use node type names as column headers for different-type edges, or `Source <Type>` / `Target <Type>` prefixes for same-type edges:

```bash
# Different source/target types
echo 'Character,Species\nPicard,Human' > crew.csv

# Same source/target type (e.g. Cocktail → Cocktail)
echo 'Source Cocktail,Target Cocktail\nBoulevardier,Negroni' > variations.csv
```

Limits: 5 MB / 5,000 rows. All-or-nothing — any validation error rejects the batch.

### Query and filter

```bash
lattice nodes list --type $PERSON --filter 'role[eq]=Engineer'        # exact match
lattice nodes list --type $PERSON --filter 'full_name[contains]=Smith' # substring (text only)
lattice nodes list --type $PERSON --sort 'full_name:asc' --limit 10   # sort + paginate
```

Operators: `eq`, `contains` (text only), `is_null`. Multiple `--filter` flags combine with AND.

### Script with --json

```bash
NODE_ID=$(lattice nodes create --type $PERSON --data '{"full_name": "Bob"}' --json | jq -r '.id')
lattice nodes list --type $PERSON --filter 'role[eq]=Intern' --json \
  | jq -r '.data[].id' | while read id; do lattice nodes delete "$id"; done
```

## Reference

See [REFERENCE.md](REFERENCE.md) for complete command syntax, all flags, JSON output schemas, and exit codes.

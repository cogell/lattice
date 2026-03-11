# Lattice CLI — Command Reference

## Global Flags

| Flag | Description |
|------|-------------|
| `--json` | Output as JSON (for scripting/piping) |
| `-q, --quiet` | Output only the resource ID (for scripting) |
| `--graph <id>` | Override active graph context |
| `--version` | Show version |
| `--help` | Show help |

## Authentication

```bash
lattice login                                # interactive — prompts for API URL + token
lattice login --token <pat-token>            # non-interactive, uses default production URL
lattice login --api-url <url> --token <token> # explicit server + token
lattice logout                               # clear stored token
```

Default API URL: `https://lattice-api.cogell.workers.dev/api/v1`

## Configuration

```bash
lattice config set --api-url <url> --token <token>
lattice config get <key>          # api_url | token
lattice config show               # display all config
```

Config stored at `~/.lattice/config.json`.

## Graphs

```bash
lattice graphs list [--limit <n>] [--offset <n>]
lattice graphs create --name <name> [--description <desc>]
lattice graphs get <graphId>
lattice graphs update <graphId> [--name <name>] [--description <desc>]
lattice graphs delete <graphId>
lattice graphs use <graphId>      # set active graph context
lattice graphs current            # show active graph
lattice graphs unuse              # clear active graph context
```

## Node Types

All node-type commands require a graph context (via `graphs use` or `--graph`).

```bash
lattice node-types list
lattice node-types create --name <name> [--color <hex>] [--icon <lucideIcon>]
lattice node-types get <nodeTypeId>
lattice node-types update <nodeTypeId> [--name <name>] [--color <hex>] [--icon <icon>] [--display-field <fieldSlug>]
lattice node-types delete <nodeTypeId>
```

### Node Type Fields

```bash
lattice node-types fields list --type <nodeTypeId>
lattice node-types fields create --type <nodeTypeId> --name <name> --field-type <type> [--ordinal <n>] [--required] [--options <opt1,opt2,...>]
lattice node-types fields update <fieldId> --type <nodeTypeId> [--name <name>] [--ordinal <n>] [--required] [--no-required] [--options <opts>]
lattice node-types fields delete <fieldId> --type <nodeTypeId>
```

**Field types:** `text`, `number`, `boolean`, `date`, `url`, `email`, `select`, `multi_select`

`--options` is only valid for `select` and `multi_select` (comma-separated values).

## Edge Types

```bash
lattice edge-types list
lattice edge-types create --name <name> --source-type <nodeTypeId> --target-type <nodeTypeId> [--directed] [--undirected]
lattice edge-types get <edgeTypeId>
lattice edge-types update <edgeTypeId> [--name <name>] [--directed] [--undirected]
lattice edge-types delete <edgeTypeId>
```

Source/target node type constraints are immutable after creation.

### Edge Type Fields

```bash
lattice edge-types fields list --type <edgeTypeId>
lattice edge-types fields create --type <edgeTypeId> --name <name> --field-type <type> [--ordinal <n>] [--required] [--options <opts>]
lattice edge-types fields update <fieldId> --type <edgeTypeId> [--name <name>] [--ordinal <n>] [--required] [--no-required] [--options <opts>]
lattice edge-types fields delete <fieldId> --type <edgeTypeId>
```

## Nodes

```bash
lattice nodes list --type <nodeTypeId> [--filter <filter>] [--sort <sort>] [--limit <n>] [--offset <n>]
lattice nodes create --type <nodeTypeId> --data '<json>'
lattice nodes get <nodeId>
lattice nodes update <nodeId> --data '<json>'
lattice nodes delete <nodeId>
```

### Filter Syntax

Format: `field_slug[operator]=value`. Multiple `--filter` flags combine with AND.

```bash
--filter 'name[eq]=Alice'              # exact match
--filter 'description[contains]=important'  # substring (text fields only)
--filter 'email[is_null]=true'         # null check
```

**Operators:** `eq`, `contains` (text only), `is_null`

### Sort Syntax

```bash
--sort 'field_slug:asc'
--sort 'field_slug:desc'
```

Default sort is creation order (ULID ascending) when `--sort` is omitted.

### Data Format

`--data` accepts JSON with field slugs as keys:

```bash
--data '{"full_name": "Alice Smith", "email": "alice@example.com", "age": 30}'
```

## Edges

```bash
lattice edges list --type <edgeTypeId> [--filter <filter>] [--sort <sort>] [--limit <n>] [--offset <n>]
lattice edges create --type <edgeTypeId> --source <nodeId> --target <nodeId> [--data '<json>']
lattice edges get <edgeId>
lattice edges update <edgeId> --data '<json>'
lattice edges delete <edgeId>
```

Filter, sort, and data syntax are identical to nodes.

## CSV Import

```bash
lattice import nodes --type <nodeTypeId> --file <path>
lattice import edges --type <edgeTypeId> --file <path>
```

- Max file size: 5 MB, max rows: 5,000
- CSV headers must match field **display names** (not slugs)
- All-or-nothing: any row validation error rejects the entire batch
- On failure, all row-level errors are displayed

### Edge CSV column formats

Edge CSVs identify source and target nodes using one of three column styles:

| Style | Columns | When to use |
|-------|---------|-------------|
| Raw IDs | `source_node_id`, `target_node_id` | Always works |
| Display names | `<NodeTypeName>`, `<NodeTypeName>` | Different source/target types (e.g. `Character`, `Species`) |
| Prefixed names | `Source <TypeName>`, `Target <TypeName>` | Same source/target type (e.g. `Source Cocktail`, `Target Cocktail`) |

Display-name columns resolve against each node type's `display_field_slug`. Values must be unique within the node type.

You can mix styles (e.g. `Source Cocktail` + `target_node_id`). Additional data columns are preserved alongside any style.

```bash
# Different types — use node type names as headers
echo 'Character,Species\nPicard,Human' > crew.csv
lattice import edges --type $EDGE_TYPE --file crew.csv

# Same type — use Source/Target prefixes
echo 'Source Cocktail,Target Cocktail\nBoulevardier,Negroni' > variations.csv
lattice import edges --type $VARIATION_OF --file variations.csv
```

## CSV Export

```bash
lattice export nodes --type <nodeTypeId> [--output <path>]
lattice export edges --type <edgeTypeId> [--output <path>]
```

Without `--output`, CSV is written to stdout (pipe-friendly).

## JSON Output Schemas

All commands support `--json`. Output shapes:

**List:**
```json
{
  "data": [...],
  "pagination": { "total": 100, "limit": 50, "offset": 0, "has_more": true }
}
```

**Get / Create / Update:**
```json
{ "id": "...", "name": "...", "created_at": "...", "updated_at": "...", ... }
```

**Delete:**
```json
{ "deleted": true, "id": "..." }
```

**Error:**
```json
{ "error": { "status": 404, "message": "Graph not found" } }
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (API error, validation failure, missing config) |

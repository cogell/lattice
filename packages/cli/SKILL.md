# Lattice CLI

Lattice is a graph database for modeling entities (nodes) and relationships (edges) with user-defined schemas (types and fields). The CLI provides full CRUD over all resources, CSV import/export, filtering, sorting, and JSON output for scripting.

## Installation & Configuration

```bash
# Set API URL and authentication token
lattice config set --api-url <url> --token <token>

# Verify configuration
lattice config show

# Get a single config value
lattice config get api_url
```

Config is stored at `~/.lattice/config.json`.

## Global Flags

| Flag | Description |
|------|-------------|
| `--json` | Output as JSON (for scripting/piping) |
| `--graph <id>` | Override active graph context |
| `--version` | Show version |
| `--help` | Show help |

## Graph Management

```bash
# List all graphs
lattice graphs list [--limit <n>] [--offset <n>]

# Create a graph
lattice graphs create --name <name> [--description <desc>]

# Get graph details
lattice graphs get <graphId>

# Update a graph
lattice graphs update <graphId> [--name <name>] [--description <desc>]

# Delete a graph
lattice graphs delete <graphId>

# Set active graph context (persists across invocations)
lattice graphs use <graphId>

# Show current active graph
lattice graphs current

# Clear active graph context
lattice graphs unuse
```

## Node Type Management

All node-type commands require a graph context (via `graphs use` or `--graph`).

```bash
# List node types
lattice node-types list

# Create a node type
lattice node-types create --name <name> [--color <hex>] [--icon <lucideIcon>]

# Get node type details
lattice node-types get <nodeTypeId>

# Update a node type
lattice node-types update <nodeTypeId> [--name <name>] [--color <hex>] [--icon <icon>] [--display-field <fieldSlug>]

# Delete a node type (cascades to nodes and edges)
lattice node-types delete <nodeTypeId>
```

## Node Type Field Management

```bash
# List fields on a node type
lattice node-types fields list --type <nodeTypeId>

# Create a field
lattice node-types fields create --type <nodeTypeId> --name <name> --field-type <type> [--ordinal <n>] [--required] [--options <opt1,opt2,...>]

# Update a field (cannot change field_type)
lattice node-types fields update <fieldId> --type <nodeTypeId> [--name <name>] [--ordinal <n>] [--required] [--no-required] [--options <opts>]

# Delete a field
lattice node-types fields delete <fieldId> --type <nodeTypeId>
```

**Field types:** `text`, `number`, `boolean`, `date`, `url`, `email`, `select`, `multi_select`

The `--options` flag is only valid for `select` and `multi_select` types (comma-separated values).

## Edge Type Management

```bash
# List edge types
lattice edge-types list

# Create an edge type
lattice edge-types create --name <name> --source-type <nodeTypeId> --target-type <nodeTypeId> [--directed] [--undirected]

# Get edge type details
lattice edge-types get <edgeTypeId>

# Update an edge type (cannot change source/target types)
lattice edge-types update <edgeTypeId> [--name <name>] [--directed] [--undirected]

# Delete an edge type
lattice edge-types delete <edgeTypeId>
```

## Edge Type Field Management

Same structure as node type fields:

```bash
lattice edge-types fields list --type <edgeTypeId>
lattice edge-types fields create --type <edgeTypeId> --name <name> --field-type <type> [--ordinal <n>] [--required] [--options <opts>]
lattice edge-types fields update <fieldId> --type <edgeTypeId> [--name] [--ordinal] [--required/--no-required] [--options]
lattice edge-types fields delete <fieldId> --type <edgeTypeId>
```

## Node Management

```bash
# List nodes (--type is required)
lattice nodes list --type <nodeTypeId> [--filter <filter>] [--sort <sort>] [--limit <n>] [--offset <n>]

# Create a node
lattice nodes create --type <nodeTypeId> --data '<json>'

# Get a node
lattice nodes get <nodeId>

# Update a node (partial update)
lattice nodes update <nodeId> --data '<json>'

# Delete a node (connected edges also deleted)
lattice nodes delete <nodeId>
```

### Filter Syntax

Filters use the format `field_slug[operator]=value`. Multiple filters combine with AND:

```bash
# Exact match
--filter 'name[eq]=Alice'

# Substring search
--filter 'description[contains]=important'

# Null check
--filter 'email[is_null]=true'

# Multiple filters (AND)
--filter 'status[eq]=active' --filter 'role[contains]=engineer'
```

**Operators:** `eq`, `contains`, `is_null`

### Sort Syntax

```bash
--sort 'field_slug:asc'
--sort 'field_slug:desc'
```

### Data Format

The `--data` flag accepts a JSON string with field slugs as keys:

```bash
--data '{"full_name": "Alice Smith", "email": "alice@example.com", "age": 30}'
```

## Edge Management

```bash
# List edges
lattice edges list --type <edgeTypeId> [--filter <filter>] [--sort <sort>] [--limit <n>] [--offset <n>]

# Create an edge
lattice edges create --type <edgeTypeId> --source <nodeId> --target <nodeId> [--data '<json>']

# Get an edge
lattice edges get <edgeId>

# Update an edge
lattice edges update <edgeId> --data '<json>'

# Delete an edge
lattice edges delete <edgeId>
```

## CSV Import

```bash
# Import nodes from CSV
lattice import nodes --type <nodeTypeId> --file <path>

# Import edges from CSV
lattice import edges --type <edgeTypeId> --file <path>
```

- Max file size: 5 MB, max rows: 5,000
- CSV headers must match field names (not slugs)
- Import is all-or-nothing: if any row fails validation, none are imported
- On failure, all row errors are displayed

## CSV Export

```bash
# Export nodes to stdout (pipe-friendly)
lattice export nodes --type <nodeTypeId>

# Export to file
lattice export nodes --type <nodeTypeId> --output <path>

# Export edges
lattice export edges --type <edgeTypeId> [--output <path>]
```

## JSON Output Schema

When using `--json`, output follows these patterns:

**List commands:**
```json
{
  "data": [...],
  "pagination": { "total": 100, "limit": 50, "offset": 0, "has_more": true }
}
```

**Get/Create/Update commands:**
```json
{ "id": "...", "name": "...", ... }
```

**Delete commands:**
```json
{ "deleted": true, "id": "..." }
```

**Errors:**
```json
{ "error": { "status": 404, "message": "Graph not found" } }
```

## Common Workflows

### Set up a new graph with schema

```bash
# Create graph and set as active
lattice graphs create --name "Knowledge Graph" --json | jq -r '.id' | xargs lattice graphs use

# Create node types
lattice node-types create --name "Person" --color "#4A90D9" --icon "user"
lattice node-types create --name "Company" --color "#50C878" --icon "building"

# Add fields to Person
PERSON=$(lattice node-types list --json | jq -r '.[0].id')
lattice node-types fields create --type $PERSON --name "Full Name" --field-type text --required
lattice node-types fields create --type $PERSON --name "Email" --field-type email
lattice node-types fields create --type $PERSON --name "Role" --field-type select --options "Engineer,Designer,Manager,Executive"

# Create edge type
COMPANY=$(lattice node-types list --json | jq -r '.[1].id')
lattice edge-types create --name "Works At" --source-type $PERSON --target-type $COMPANY
```

### Bulk import data

```bash
# Import nodes from CSV (headers = field names)
lattice import nodes --type $PERSON --file people.csv

# Import edges
lattice import edges --type $EDGE_TYPE --file relationships.csv
```

### Query and filter

```bash
# Find all active engineers
lattice nodes list --type $PERSON --filter 'role[eq]=Engineer'

# Search by name
lattice nodes list --type $PERSON --filter 'full_name[contains]=Smith'

# Sort by name
lattice nodes list --type $PERSON --sort 'full_name:asc'
```

### Export for backup

```bash
# Export all node types' data
for TYPE_ID in $(lattice node-types list --json | jq -r '.[].id'); do
  lattice export nodes --type $TYPE_ID --output "backup_nodes_${TYPE_ID}.csv"
done
```

### Script-driven manipulation

```bash
# Create a node and capture its ID
NODE_ID=$(lattice nodes create --type $PERSON --data '{"full_name": "Bob Jones"}' --json | jq -r '.id')

# Create an edge using captured IDs
lattice edges create --type $EDGE_TYPE --source $NODE_ID --target $COMPANY_ID --data '{"start_date": "2024-01-15"}'

# Batch delete nodes matching a filter
lattice nodes list --type $PERSON --filter 'status[eq]=inactive' --json | jq -r '.data[].id' | while read id; do
  lattice nodes delete "$id"
done
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (API error, validation failure, missing config) |

PRAGMA foreign_keys = ON;

-- Users (managed by BetterAuth)
CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Sessions (managed by BetterAuth)
CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- PAT tokens
CREATE TABLE pat_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  last_used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Graphs
CREATE TABLE graphs (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Node types
CREATE TABLE node_types (
  id TEXT PRIMARY KEY NOT NULL,
  graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  color TEXT,
  icon TEXT,
  display_field_slug TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE(graph_id, slug)
);

-- Node type fields
CREATE TABLE node_type_fields (
  id TEXT PRIMARY KEY NOT NULL,
  node_type_id TEXT NOT NULL REFERENCES node_types(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  field_type TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  required INTEGER NOT NULL DEFAULT 0,
  config TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE(node_type_id, slug)
);

-- Edge types
CREATE TABLE edge_types (
  id TEXT PRIMARY KEY NOT NULL,
  graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  directed INTEGER NOT NULL DEFAULT 1,
  source_node_type_id TEXT NOT NULL REFERENCES node_types(id) ON DELETE CASCADE,
  target_node_type_id TEXT NOT NULL REFERENCES node_types(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE(graph_id, slug)
);

-- Edge type fields
CREATE TABLE edge_type_fields (
  id TEXT PRIMARY KEY NOT NULL,
  edge_type_id TEXT NOT NULL REFERENCES edge_types(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  field_type TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  required INTEGER NOT NULL DEFAULT 0,
  config TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE(edge_type_id, slug)
);

-- Nodes
CREATE TABLE nodes (
  id TEXT PRIMARY KEY NOT NULL,
  graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
  node_type_id TEXT NOT NULL REFERENCES node_types(id) ON DELETE CASCADE,
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Edges
CREATE TABLE edges (
  id TEXT PRIMARY KEY NOT NULL,
  graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
  edge_type_id TEXT NOT NULL REFERENCES edge_types(id) ON DELETE CASCADE,
  source_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  target_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Indices
CREATE INDEX idx_nodes_graph_type ON nodes(graph_id, node_type_id);
CREATE INDEX idx_edges_graph_type ON edges(graph_id, edge_type_id);
CREATE INDEX idx_edges_source ON edges(source_node_id);
CREATE INDEX idx_edges_target ON edges(target_node_id);
CREATE INDEX idx_node_type_fields_type ON node_type_fields(node_type_id);
CREATE INDEX idx_edge_type_fields_type ON edge_type_fields(edge_type_id);
CREATE INDEX idx_pat_tokens_hash ON pat_tokens(token_hash);

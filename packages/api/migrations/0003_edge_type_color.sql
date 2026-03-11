-- Add color column to edge_types, matching the pattern already used by node_types.
-- Auto-assign palette colors to any existing rows, cycling per graph.

ALTER TABLE edge_types ADD COLUMN color TEXT;

-- Backfill existing rows.  For each edge_type we count how many sibling rows
-- (same graph_id) were created at or before it (using created_at, id as tie-
-- breaker) to produce a 0-based rank, then pick a color via modulo 12.
--
-- Palette (12 colors):
--   0  #ef4444   1  #f97316   2  #f59e0b   3  #84cc16
--   4  #22c55e   5  #14b8a6   6  #06b6d4   7  #3b82f6
--   8  #6366f1   9  #a855f7  10  #ec4899  11  #78716c

UPDATE edge_types
SET color = (
  SELECT CASE (
    (SELECT COUNT(*)
       FROM edge_types AS et2
      WHERE et2.graph_id = edge_types.graph_id
        AND (et2.created_at < edge_types.created_at
             OR (et2.created_at = edge_types.created_at AND et2.id < edge_types.id))
    ) % 12
  )
    WHEN  0 THEN '#ef4444'
    WHEN  1 THEN '#f97316'
    WHEN  2 THEN '#f59e0b'
    WHEN  3 THEN '#84cc16'
    WHEN  4 THEN '#22c55e'
    WHEN  5 THEN '#14b8a6'
    WHEN  6 THEN '#06b6d4'
    WHEN  7 THEN '#3b82f6'
    WHEN  8 THEN '#6366f1'
    WHEN  9 THEN '#a855f7'
    WHEN 10 THEN '#ec4899'
    WHEN 11 THEN '#78716c'
  END
)
WHERE color IS NULL;

import { z } from "zod";

// --- Edge schemas ---

export const createEdgeSchema = z.object({
  edge_type_id: z.string().min(1, "Edge type is required"),
  source_node_id: z.string().min(1, "Source node is required"),
  target_node_id: z.string().min(1, "Target node is required"),
  data: z.record(z.string(), z.unknown()).optional().default({}),
});

export const updateEdgeSchema = z.object({
  data: z.record(z.string(), z.unknown()),
});

export const edgeSchema = z.object({
  id: z.string(),
  graph_id: z.string(),
  edge_type_id: z.string(),
  source_node_id: z.string(),
  target_node_id: z.string(),
  data: z.record(z.string(), z.unknown()),
  created_at: z.string(),
  updated_at: z.string(),
});

export type Edge = z.infer<typeof edgeSchema>;
export type CreateEdgeInput = z.infer<typeof createEdgeSchema>;
export type UpdateEdgeInput = z.infer<typeof updateEdgeSchema>;

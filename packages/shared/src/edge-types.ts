import { z } from "zod";

// --- Edge Type schemas ---

export const createEdgeTypeSchema = z.object({
  name: z.string().min(1, "Edge type name is required").trim(),
  directed: z.boolean().optional().default(true),
  source_node_type_id: z.string().min(1, "Source node type is required"),
  target_node_type_id: z.string().min(1, "Target node type is required"),
});

export const updateEdgeTypeSchema = z.object({
  name: z.string().min(1, "Edge type name cannot be empty").trim().optional(),
  directed: z.boolean().optional(),
});

export const edgeTypeSchema = z.object({
  id: z.string(),
  graph_id: z.string(),
  name: z.string(),
  slug: z.string(),
  directed: z.boolean(),
  source_node_type_id: z.string(),
  target_node_type_id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type EdgeType = z.infer<typeof edgeTypeSchema>;
export type CreateEdgeTypeInput = z.infer<typeof createEdgeTypeSchema>;
export type UpdateEdgeTypeInput = z.infer<typeof updateEdgeTypeSchema>;

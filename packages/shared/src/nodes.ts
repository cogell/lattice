import { z } from "zod";

// --- Node schemas ---

export const createNodeSchema = z.object({
  node_type_id: z.string().min(1, "Node type is required"),
  data: z.record(z.string(), z.unknown()).optional().default({}),
});

export const updateNodeSchema = z.object({
  data: z.record(z.string(), z.unknown()),
});

export const nodeSchema = z.object({
  id: z.string(),
  graph_id: z.string(),
  node_type_id: z.string(),
  data: z.record(z.string(), z.unknown()),
  created_at: z.string(),
  updated_at: z.string(),
});

export type Node = z.infer<typeof nodeSchema>;
export type CreateNodeInput = z.infer<typeof createNodeSchema>;
export type UpdateNodeInput = z.infer<typeof updateNodeSchema>;

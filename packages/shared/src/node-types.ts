import { z } from "zod";

// --- Node Type schemas ---

export const createNodeTypeSchema = z.object({
  name: z.string().min(1, "Node type name is required").trim(),
  color: z.string().trim().optional(),
  icon: z.string().trim().optional(),
});

export const updateNodeTypeSchema = z.object({
  name: z.string().min(1, "Node type name cannot be empty").trim().optional(),
  color: z.string().trim().nullable().optional(),
  icon: z.string().trim().nullable().optional(),
  display_field_slug: z.string().trim().nullable().optional(),
});

export const nodeTypeSchema = z.object({
  id: z.string(),
  graph_id: z.string(),
  name: z.string(),
  slug: z.string(),
  color: z.string().nullable(),
  icon: z.string().nullable(),
  display_field_slug: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type NodeType = z.infer<typeof nodeTypeSchema>;
export type CreateNodeTypeInput = z.infer<typeof createNodeTypeSchema>;
export type UpdateNodeTypeInput = z.infer<typeof updateNodeTypeSchema>;

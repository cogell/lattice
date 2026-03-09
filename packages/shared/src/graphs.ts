import { z } from "zod";

// --- Zod schemas ---

export const createGraphSchema = z.object({
  name: z.string().min(1, "Graph name is required").trim(),
  description: z.string().trim().optional(),
});

export const updateGraphSchema = z.object({
  name: z.string().min(1, "Graph name cannot be empty").trim().optional(),
  description: z.string().trim().optional(),
});

export const graphSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  created_by: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type Graph = z.infer<typeof graphSchema>;
export type CreateGraphInput = z.infer<typeof createGraphSchema>;
export type UpdateGraphInput = z.infer<typeof updateGraphSchema>;

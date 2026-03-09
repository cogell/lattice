import { z } from "zod";
import { fieldTypeSchema } from "./field-types.js";

// --- Field schemas (shared by node type fields and edge type fields) ---

const selectConfigSchema = z.object({
  options: z.array(z.string().min(1)).min(1, "At least one option required"),
});

export const createFieldSchema = z.object({
  name: z.string().min(1, "Field name is required").trim(),
  field_type: fieldTypeSchema,
  ordinal: z.number().int().min(0),
  required: z.boolean().optional().default(false),
  config: z.union([selectConfigSchema, z.object({})]).optional().default({}),
});

export const updateFieldSchema = z.object({
  name: z.string().min(1, "Field name cannot be empty").trim().optional(),
  ordinal: z.number().int().min(0).optional(),
  required: z.boolean().optional(),
  config: z.union([selectConfigSchema, z.object({})]).optional(),
});

/** Schema for field responses from the API (boolean required, parsed config object). */
export const fieldSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  field_type: z.string(),
  ordinal: z.number(),
  required: z.boolean(),
  config: z.record(z.string(), z.unknown()),
  created_at: z.string(),
  updated_at: z.string(),
});

/** Node type field response includes node_type_id. */
export const nodeTypeFieldSchema = fieldSchema.extend({
  node_type_id: z.string(),
});

/** Edge type field response includes edge_type_id. */
export const edgeTypeFieldSchema = fieldSchema.extend({
  edge_type_id: z.string(),
});

export type Field = z.infer<typeof fieldSchema>;
export type NodeTypeField = z.infer<typeof nodeTypeFieldSchema>;
export type EdgeTypeField = z.infer<typeof edgeTypeFieldSchema>;
export type CreateFieldInput = z.infer<typeof createFieldSchema>;
export type UpdateFieldInput = z.infer<typeof updateFieldSchema>;

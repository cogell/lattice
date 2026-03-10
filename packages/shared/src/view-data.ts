import { z } from "zod";
import { nodeSchema } from "./nodes.js";
import { edgeSchema } from "./edges.js";
import { nodeTypeSchema } from "./node-types.js";
import { edgeTypeSchema } from "./edge-types.js";
import { fieldSchema } from "./fields.js";

// --- View Data schemas (denormalized graph visualization payload) ---

/** Node type with embedded fields for the visualization response. */
export const viewNodeTypeSchema = nodeTypeSchema.extend({
  fields: z.array(fieldSchema),
});

/** Edge type with embedded fields for the visualization response. */
export const viewEdgeTypeSchema = edgeTypeSchema.extend({
  fields: z.array(fieldSchema),
});

/** Counts and limits for truncation reporting. */
export const viewDataCountsSchema = z.object({
  nodes: z.number(),
  edges: z.number(),
  node_limit: z.number(),
  edge_limit: z.number(),
});

/** The full view-data response payload. */
export const viewDataSchema = z.object({
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
  node_types: z.array(viewNodeTypeSchema),
  edge_types: z.array(viewEdgeTypeSchema),
  truncated: z.boolean(),
  counts: viewDataCountsSchema,
});

/** Wrapped in the standard { data: ... } envelope for API responses. */
export const viewDataResponseSchema = z.object({
  data: viewDataSchema,
});

export type ViewNodeType = z.infer<typeof viewNodeTypeSchema>;
export type ViewEdgeType = z.infer<typeof viewEdgeTypeSchema>;
export type ViewDataCounts = z.infer<typeof viewDataCountsSchema>;
export type ViewData = z.infer<typeof viewDataSchema>;

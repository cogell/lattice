import { z } from "zod";
import {
  graphSchema,
  createGraphSchema,
  updateGraphSchema,
  type CreateGraphInput,
  type UpdateGraphInput,
  type Graph,
} from "./graphs.js";
import {
  nodeTypeSchema,
  createNodeTypeSchema,
  updateNodeTypeSchema,
  type CreateNodeTypeInput,
  type UpdateNodeTypeInput,
  type NodeType,
} from "./node-types.js";
import {
  edgeTypeSchema,
  createEdgeTypeSchema,
  updateEdgeTypeSchema,
  type CreateEdgeTypeInput,
  type UpdateEdgeTypeInput,
  type EdgeType,
} from "./edge-types.js";
import {
  nodeTypeFieldSchema,
  edgeTypeFieldSchema,
  createFieldSchema,
  updateFieldSchema,
  type CreateFieldInput,
  type UpdateFieldInput,
  type NodeTypeField,
  type EdgeTypeField,
} from "./fields.js";
import {
  nodeSchema,
  createNodeSchema,
  updateNodeSchema,
  type Node,
  type CreateNodeInput,
  type UpdateNodeInput,
} from "./nodes.js";
import {
  edgeSchema,
  createEdgeSchema,
  updateEdgeSchema,
  type Edge,
  type CreateEdgeInput,
  type UpdateEdgeInput,
} from "./edges.js";
import {
  paginationMetaSchema,
  type PaginationMeta,
  type FilterOperator,
} from "./pagination.js";
import {
  viewDataResponseSchema,
  type ViewData,
} from "./view-data.js";

/** Options for paginated list endpoints. */
export interface ListOptions {
  limit?: number;
  offset?: number;
  sort?: string; // "fieldSlug:asc" or "fieldSlug:desc"
  filters?: Record<string, Partial<Record<FilterOperator, string>>>;
}

/** Return type for paginated list endpoints. */
export interface PaginatedResult<T> {
  data: T[];
  pagination: PaginationMeta;
}

/** Build a query string from ListOptions + optional extra params. */
function buildListQuery(opts?: ListOptions, extra?: Record<string, string>): string {
  const params = new URLSearchParams();
  if (extra) {
    for (const [k, v] of Object.entries(extra)) params.set(k, v);
  }
  if (opts?.limit !== undefined) params.set("limit", String(opts.limit));
  if (opts?.offset !== undefined) params.set("offset", String(opts.offset));
  if (opts?.sort) params.set("sort", opts.sort);
  if (opts?.filters) {
    for (const [slug, ops] of Object.entries(opts.filters)) {
      for (const [op, value] of Object.entries(ops)) {
        if (value !== undefined) params.set(`filter[${slug}][${op}]`, value);
      }
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

class ApiError extends Error {
  /** Per-row validation details returned by import endpoints. */
  details?: Array<{ row: number; field: string; message: string }>;

  constructor(
    public status: number,
    message: string,
    details?: Array<{ row: number; field: string; message: string }>,
  ) {
    super(message);
    this.name = "ApiError";
    if (details) this.details = details;
  }
}

const errorBody = z.object({ error: z.object({ status: z.number(), message: z.string() }) });
const importErrorBody = z.object({
  error: z.object({
    status: z.number(),
    message: z.string(),
    details: z.array(z.object({ row: z.number(), field: z.string(), message: z.string() })),
  }),
});

async function parseResponse<T>(res: Response, schema: z.ZodType<T>): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const parsed = errorBody.safeParse(body);
    const message = parsed.success ? parsed.data.error.message : `HTTP ${res.status}`;
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as unknown as T;
  const json = await res.json();
  return schema.parse(json);
}

/** Options for configuring the API client factory. */
export interface ApiClientOptions {
  baseUrl: string;
  getAuthHeader: () => string;
  /** Extra RequestInit properties merged into every fetch call (e.g. credentials). */
  fetchInit?: RequestInit;
}

/** Typed API client factory — methods added per phase. */
export function createApiClient(
  baseUrl: string,
  getAuthHeader: () => string,
  fetchInit?: RequestInit,
) {
  const headers = () => ({
    Authorization: getAuthHeader(),
    "Content-Type": "application/json",
  });

  const doFetch = (url: string, init?: RequestInit) =>
    fetch(url, { ...fetchInit, ...init, headers: { ...headers(), ...init?.headers } });

  const dataWrapper = <S extends z.ZodTypeAny>(schema: S) =>
    z.object({ data: schema });

  const graphResponse = dataWrapper(graphSchema);
  const nodeTypeResponse = dataWrapper(nodeTypeSchema);
  const nodeTypeListResponse = dataWrapper(z.array(nodeTypeSchema));
  const edgeTypeResponse = dataWrapper(edgeTypeSchema);
  const edgeTypeListResponse = dataWrapper(z.array(edgeTypeSchema));
  const nodeTypeFieldResponse = dataWrapper(nodeTypeFieldSchema);
  const edgeTypeFieldResponse = dataWrapper(edgeTypeFieldSchema);
  const nodeResponse = dataWrapper(nodeSchema);
  const edgeResponse = dataWrapper(edgeSchema);

  // Paginated response schemas for list endpoints
  const paginatedWrapper = <S extends z.ZodTypeAny>(schema: S) =>
    z.object({ data: z.array(schema), pagination: paginationMetaSchema });
  const graphPaginatedResponse = paginatedWrapper(graphSchema);
  const nodePaginatedResponse = paginatedWrapper(nodeSchema);
  const edgePaginatedResponse = paginatedWrapper(edgeSchema);

  // Token schemas
  const tokenSchema = z.object({
    id: z.string(),
    name: z.string(),
    created_at: z.string(),
    last_used_at: z.string().nullable(),
  });
  const createdTokenSchema = z.object({
    id: z.string(),
    name: z.string(),
    token: z.string(),
    created_at: z.string(),
  });
  const tokenListResponse = dataWrapper(z.array(tokenSchema));
  const createdTokenResponse = dataWrapper(createdTokenSchema);

  return {
    _baseUrl: baseUrl,
    _headers: headers,

    // --- Graph endpoints ---

    async createGraph(input: CreateGraphInput): Promise<Graph> {
      const body = createGraphSchema.parse(input);
      const res = await doFetch(`${baseUrl}/graphs`, {
        method: "POST",

        body: JSON.stringify(body),
      });
      const parsed = await parseResponse(res, graphResponse);
      return parsed.data;
    },

    async listGraphs(opts?: ListOptions): Promise<PaginatedResult<Graph>> {
      const qs = buildListQuery(opts);
      const res = await doFetch(`${baseUrl}/graphs${qs}`);
      return parseResponse(res, graphPaginatedResponse);
    },

    async getGraph(graphId: string): Promise<Graph> {
      const res = await doFetch(`${baseUrl}/graphs/${graphId}`);
      const parsed = await parseResponse(res, graphResponse);
      return parsed.data;
    },

    async updateGraph(graphId: string, input: UpdateGraphInput): Promise<Graph> {
      const body = updateGraphSchema.parse(input);
      const res = await doFetch(`${baseUrl}/graphs/${graphId}`, {
        method: "PATCH",

        body: JSON.stringify(body),
      });
      const parsed = await parseResponse(res, graphResponse);
      return parsed.data;
    },

    async deleteGraph(graphId: string): Promise<void> {
      const res = await doFetch(`${baseUrl}/graphs/${graphId}`, {
        method: "DELETE",

      });
      await parseResponse(res, z.undefined());
    },

    // --- Node Type endpoints ---

    async createNodeType(graphId: string, input: CreateNodeTypeInput): Promise<NodeType> {
      const body = createNodeTypeSchema.parse(input);
      const res = await doFetch(`${baseUrl}/graphs/${graphId}/node-types`, {
        method: "POST",

        body: JSON.stringify(body),
      });
      const parsed = await parseResponse(res, nodeTypeResponse);
      return parsed.data;
    },

    async listNodeTypes(graphId: string): Promise<NodeType[]> {
      const res = await doFetch(`${baseUrl}/graphs/${graphId}/node-types`);
      const parsed = await parseResponse(res, nodeTypeListResponse);
      return parsed.data;
    },

    async getNodeType(graphId: string, nodeTypeId: string): Promise<NodeType> {
      const res = await doFetch(`${baseUrl}/graphs/${graphId}/node-types/${nodeTypeId}`);
      const parsed = await parseResponse(res, nodeTypeResponse);
      return parsed.data;
    },

    async updateNodeType(graphId: string, nodeTypeId: string, input: UpdateNodeTypeInput): Promise<NodeType> {
      const body = updateNodeTypeSchema.parse(input);
      const res = await doFetch(`${baseUrl}/graphs/${graphId}/node-types/${nodeTypeId}`, {
        method: "PATCH",

        body: JSON.stringify(body),
      });
      const parsed = await parseResponse(res, nodeTypeResponse);
      return parsed.data;
    },

    async deleteNodeType(graphId: string, nodeTypeId: string): Promise<void> {
      const res = await doFetch(`${baseUrl}/graphs/${graphId}/node-types/${nodeTypeId}`, {
        method: "DELETE",

      });
      await parseResponse(res, z.undefined());
    },

    // --- Edge Type endpoints ---

    async createEdgeType(graphId: string, input: CreateEdgeTypeInput): Promise<EdgeType> {
      const body = createEdgeTypeSchema.parse(input);
      const res = await doFetch(`${baseUrl}/graphs/${graphId}/edge-types`, {
        method: "POST",

        body: JSON.stringify(body),
      });
      const parsed = await parseResponse(res, edgeTypeResponse);
      return parsed.data;
    },

    async listEdgeTypes(graphId: string): Promise<EdgeType[]> {
      const res = await doFetch(`${baseUrl}/graphs/${graphId}/edge-types`);
      const parsed = await parseResponse(res, edgeTypeListResponse);
      return parsed.data;
    },

    async getEdgeType(graphId: string, edgeTypeId: string): Promise<EdgeType> {
      const res = await doFetch(`${baseUrl}/graphs/${graphId}/edge-types/${edgeTypeId}`);
      const parsed = await parseResponse(res, edgeTypeResponse);
      return parsed.data;
    },

    async updateEdgeType(graphId: string, edgeTypeId: string, input: UpdateEdgeTypeInput): Promise<EdgeType> {
      const body = updateEdgeTypeSchema.parse(input);
      const res = await doFetch(`${baseUrl}/graphs/${graphId}/edge-types/${edgeTypeId}`, {
        method: "PATCH",

        body: JSON.stringify(body),
      });
      const parsed = await parseResponse(res, edgeTypeResponse);
      return parsed.data;
    },

    async deleteEdgeType(graphId: string, edgeTypeId: string): Promise<void> {
      const res = await doFetch(`${baseUrl}/graphs/${graphId}/edge-types/${edgeTypeId}`, {
        method: "DELETE",

      });
      await parseResponse(res, z.undefined());
    },

    // --- Node Type Field endpoints ---

    async listNodeTypeFields(graphId: string, nodeTypeId: string): Promise<NodeTypeField[]> {
      const res = await doFetch(`${baseUrl}/graphs/${graphId}/node-types/${nodeTypeId}/fields`);
      const parsed = await parseResponse(res, dataWrapper(z.array(nodeTypeFieldSchema)));
      return parsed.data;
    },

    async createNodeTypeField(graphId: string, nodeTypeId: string, input: CreateFieldInput): Promise<NodeTypeField> {
      const body = createFieldSchema.parse(input);
      const res = await doFetch(`${baseUrl}/graphs/${graphId}/node-types/${nodeTypeId}/fields`, {
        method: "POST",

        body: JSON.stringify(body),
      });
      const parsed = await parseResponse(res, nodeTypeFieldResponse);
      return parsed.data;
    },

    async updateNodeTypeField(graphId: string, nodeTypeId: string, fieldId: string, input: UpdateFieldInput): Promise<NodeTypeField> {
      const body = updateFieldSchema.parse(input);
      const res = await doFetch(`${baseUrl}/graphs/${graphId}/node-types/${nodeTypeId}/fields/${fieldId}`, {
        method: "PATCH",

        body: JSON.stringify(body),
      });
      const parsed = await parseResponse(res, nodeTypeFieldResponse);
      return parsed.data;
    },

    async deleteNodeTypeField(graphId: string, nodeTypeId: string, fieldId: string): Promise<void> {
      const res = await doFetch(`${baseUrl}/graphs/${graphId}/node-types/${nodeTypeId}/fields/${fieldId}`, {
        method: "DELETE",

      });
      await parseResponse(res, z.undefined());
    },

    // --- Edge Type Field endpoints ---

    async listEdgeTypeFields(graphId: string, edgeTypeId: string): Promise<EdgeTypeField[]> {
      const res = await doFetch(`${baseUrl}/graphs/${graphId}/edge-types/${edgeTypeId}/fields`);
      const parsed = await parseResponse(res, dataWrapper(z.array(edgeTypeFieldSchema)));
      return parsed.data;
    },

    async createEdgeTypeField(graphId: string, edgeTypeId: string, input: CreateFieldInput): Promise<EdgeTypeField> {
      const body = createFieldSchema.parse(input);
      const res = await doFetch(`${baseUrl}/graphs/${graphId}/edge-types/${edgeTypeId}/fields`, {
        method: "POST",

        body: JSON.stringify(body),
      });
      const parsed = await parseResponse(res, edgeTypeFieldResponse);
      return parsed.data;
    },

    async updateEdgeTypeField(graphId: string, edgeTypeId: string, fieldId: string, input: UpdateFieldInput): Promise<EdgeTypeField> {
      const body = updateFieldSchema.parse(input);
      const res = await doFetch(`${baseUrl}/graphs/${graphId}/edge-types/${edgeTypeId}/fields/${fieldId}`, {
        method: "PATCH",

        body: JSON.stringify(body),
      });
      const parsed = await parseResponse(res, edgeTypeFieldResponse);
      return parsed.data;
    },

    async deleteEdgeTypeField(graphId: string, edgeTypeId: string, fieldId: string): Promise<void> {
      const res = await doFetch(`${baseUrl}/graphs/${graphId}/edge-types/${edgeTypeId}/fields/${fieldId}`, {
        method: "DELETE",

      });
      await parseResponse(res, z.undefined());
    },

    // --- Node endpoints ---

    async createNode(graphId: string, input: CreateNodeInput): Promise<Node> {
      const body = createNodeSchema.parse(input);
      const res = await doFetch(`${baseUrl}/graphs/${graphId}/nodes`, {
        method: "POST",

        body: JSON.stringify(body),
      });
      const parsed = await parseResponse(res, nodeResponse);
      return parsed.data;
    },

    async listNodes(graphId: string, nodeTypeId?: string, opts?: ListOptions): Promise<PaginatedResult<Node>> {
      const extra = nodeTypeId ? { type: nodeTypeId } : undefined;
      const qs = buildListQuery(opts, extra);
      const res = await doFetch(`${baseUrl}/graphs/${graphId}/nodes${qs}`);
      return parseResponse(res, nodePaginatedResponse);
    },

    async getNode(graphId: string, nodeId: string): Promise<Node> {
      const res = await doFetch(`${baseUrl}/graphs/${graphId}/nodes/${nodeId}`);
      const parsed = await parseResponse(res, nodeResponse);
      return parsed.data;
    },

    async batchGetNodes(graphId: string, ids: string[]): Promise<Node[]> {
      if (ids.length === 0) return [];
      const res = await doFetch(`${baseUrl}/graphs/${graphId}/nodes/batch`, {
        method: "POST",
        body: JSON.stringify({ ids }),
      });
      const parsed = await parseResponse(res, dataWrapper(z.array(nodeSchema)));
      return parsed.data;
    },

    async updateNode(graphId: string, nodeId: string, input: UpdateNodeInput): Promise<Node> {
      const body = updateNodeSchema.parse(input);
      const res = await doFetch(`${baseUrl}/graphs/${graphId}/nodes/${nodeId}`, {
        method: "PATCH",

        body: JSON.stringify(body),
      });
      const parsed = await parseResponse(res, nodeResponse);
      return parsed.data;
    },

    async deleteNode(graphId: string, nodeId: string): Promise<void> {
      const res = await doFetch(`${baseUrl}/graphs/${graphId}/nodes/${nodeId}`, {
        method: "DELETE",

      });
      await parseResponse(res, z.undefined());
    },

    // --- Edge endpoints ---

    async createEdge(graphId: string, input: CreateEdgeInput): Promise<Edge> {
      const body = createEdgeSchema.parse(input);
      const res = await doFetch(`${baseUrl}/graphs/${graphId}/edges`, {
        method: "POST",

        body: JSON.stringify(body),
      });
      const parsed = await parseResponse(res, edgeResponse);
      return parsed.data;
    },

    async listEdges(graphId: string, edgeTypeId?: string, opts?: ListOptions): Promise<PaginatedResult<Edge>> {
      const extra = edgeTypeId ? { type: edgeTypeId } : undefined;
      const qs = buildListQuery(opts, extra);
      const res = await doFetch(`${baseUrl}/graphs/${graphId}/edges${qs}`);
      return parseResponse(res, edgePaginatedResponse);
    },

    async getEdge(graphId: string, edgeId: string): Promise<Edge> {
      const res = await doFetch(`${baseUrl}/graphs/${graphId}/edges/${edgeId}`);
      const parsed = await parseResponse(res, edgeResponse);
      return parsed.data;
    },

    async updateEdge(graphId: string, edgeId: string, input: UpdateEdgeInput): Promise<Edge> {
      const body = updateEdgeSchema.parse(input);
      const res = await doFetch(`${baseUrl}/graphs/${graphId}/edges/${edgeId}`, {
        method: "PATCH",

        body: JSON.stringify(body),
      });
      const parsed = await parseResponse(res, edgeResponse);
      return parsed.data;
    },

    async deleteEdge(graphId: string, edgeId: string): Promise<void> {
      const res = await doFetch(`${baseUrl}/graphs/${graphId}/edges/${edgeId}`, {
        method: "DELETE",

      });
      await parseResponse(res, z.undefined());
    },

    // --- Token endpoints ---

    async listTokens(): Promise<Token[]> {
      const res = await doFetch(`${baseUrl}/settings/tokens`);
      const parsed = await parseResponse(res, tokenListResponse);
      return parsed.data;
    },

    async createToken(input: { name: string }): Promise<CreatedToken> {
      const res = await doFetch(`${baseUrl}/settings/tokens`, {
        method: "POST",
        body: JSON.stringify(input),
      });
      const parsed = await parseResponse(res, createdTokenResponse);
      return parsed.data;
    },

    async deleteToken(tokenId: string): Promise<void> {
      const res = await doFetch(`${baseUrl}/settings/tokens/${tokenId}`, {
        method: "DELETE",
      });
      await parseResponse(res, z.undefined());
    },

    // --- View Data endpoint (graph visualization) ---

    async getViewData(graphId: string): Promise<ViewData> {
      const res = await doFetch(`${baseUrl}/graphs/${graphId}/view-data`);
      const parsed = await parseResponse(res, viewDataResponseSchema);
      return parsed.data;
    },

    // --- CSV Export / Import endpoints ---

    async exportNodes(graphId: string, nodeTypeId: string): Promise<Blob> {
      const res = await doFetch(`${baseUrl}/graphs/${graphId}/nodes/export?type=${nodeTypeId}`);
      if (!res.ok) throw new ApiError(res.status, `Export failed: HTTP ${res.status}`);
      return res.blob();
    },

    async importNodes(graphId: string, nodeTypeId: string, file: File): Promise<{ imported: number }> {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${baseUrl}/graphs/${graphId}/nodes/import?type=${nodeTypeId}`, {
        method: "POST",
        headers: { Authorization: getAuthHeader() },
        body: form,
        ...fetchInit,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const importParsed = importErrorBody.safeParse(body);
        if (importParsed.success) {
          throw new ApiError(res.status, importParsed.data.error.message, importParsed.data.error.details);
        }
        const parsed = errorBody.safeParse(body);
        const message = parsed.success ? parsed.data.error.message : `HTTP ${res.status}`;
        throw new ApiError(res.status, message);
      }
      const json = await res.json();
      return json.data ?? json;
    },

    async exportEdges(graphId: string, edgeTypeId: string): Promise<Blob> {
      const res = await doFetch(`${baseUrl}/graphs/${graphId}/edges/export?type=${edgeTypeId}`);
      if (!res.ok) throw new ApiError(res.status, `Export failed: HTTP ${res.status}`);
      return res.blob();
    },

    async importEdges(graphId: string, edgeTypeId: string, file: File): Promise<{ imported: number }> {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${baseUrl}/graphs/${graphId}/edges/import?type=${edgeTypeId}`, {
        method: "POST",
        headers: { Authorization: getAuthHeader() },
        body: form,
        ...fetchInit,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const importParsed = importErrorBody.safeParse(body);
        if (importParsed.success) {
          throw new ApiError(res.status, importParsed.data.error.message, importParsed.data.error.details);
        }
        const parsed = errorBody.safeParse(body);
        const message = parsed.success ? parsed.data.error.message : `HTTP ${res.status}`;
        throw new ApiError(res.status, message);
      }
      const json = await res.json();
      return json.data ?? json;
    },
  };
}

export type Token = { id: string; name: string; created_at: string; last_used_at: string | null };
export type CreatedToken = { id: string; name: string; token: string; created_at: string };
export { ApiError };

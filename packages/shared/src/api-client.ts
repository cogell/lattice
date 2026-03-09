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

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const errorBody = z.object({ error: z.object({ status: z.number(), message: z.string() }) });

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

/** Typed API client factory — methods added per phase. */
export function createApiClient(
  baseUrl: string,
  getAuthHeader: () => string,
) {
  const headers = () => ({
    Authorization: getAuthHeader(),
    "Content-Type": "application/json",
  });

  const dataWrapper = <S extends z.ZodTypeAny>(schema: S) =>
    z.object({ data: schema });

  const graphResponse = dataWrapper(graphSchema);
  const graphListResponse = dataWrapper(z.array(graphSchema));
  const nodeTypeResponse = dataWrapper(nodeTypeSchema);
  const nodeTypeListResponse = dataWrapper(z.array(nodeTypeSchema));
  const edgeTypeResponse = dataWrapper(edgeTypeSchema);
  const edgeTypeListResponse = dataWrapper(z.array(edgeTypeSchema));
  const nodeTypeFieldResponse = dataWrapper(nodeTypeFieldSchema);
  const edgeTypeFieldResponse = dataWrapper(edgeTypeFieldSchema);

  return {
    _baseUrl: baseUrl,
    _headers: headers,

    // --- Graph endpoints ---

    async createGraph(input: CreateGraphInput): Promise<Graph> {
      const body = createGraphSchema.parse(input);
      const res = await fetch(`${baseUrl}/graphs`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(body),
      });
      const parsed = await parseResponse(res, graphResponse);
      return parsed.data;
    },

    async listGraphs(): Promise<Graph[]> {
      const res = await fetch(`${baseUrl}/graphs`, { headers: headers() });
      const parsed = await parseResponse(res, graphListResponse);
      return parsed.data;
    },

    async getGraph(graphId: string): Promise<Graph> {
      const res = await fetch(`${baseUrl}/graphs/${graphId}`, { headers: headers() });
      const parsed = await parseResponse(res, graphResponse);
      return parsed.data;
    },

    async updateGraph(graphId: string, input: UpdateGraphInput): Promise<Graph> {
      const body = updateGraphSchema.parse(input);
      const res = await fetch(`${baseUrl}/graphs/${graphId}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify(body),
      });
      const parsed = await parseResponse(res, graphResponse);
      return parsed.data;
    },

    async deleteGraph(graphId: string): Promise<void> {
      const res = await fetch(`${baseUrl}/graphs/${graphId}`, {
        method: "DELETE",
        headers: headers(),
      });
      await parseResponse(res, z.undefined());
    },

    // --- Node Type endpoints ---

    async createNodeType(graphId: string, input: CreateNodeTypeInput): Promise<NodeType> {
      const body = createNodeTypeSchema.parse(input);
      const res = await fetch(`${baseUrl}/graphs/${graphId}/node-types`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(body),
      });
      const parsed = await parseResponse(res, nodeTypeResponse);
      return parsed.data;
    },

    async listNodeTypes(graphId: string): Promise<NodeType[]> {
      const res = await fetch(`${baseUrl}/graphs/${graphId}/node-types`, { headers: headers() });
      const parsed = await parseResponse(res, nodeTypeListResponse);
      return parsed.data;
    },

    async getNodeType(graphId: string, nodeTypeId: string): Promise<NodeType> {
      const res = await fetch(`${baseUrl}/graphs/${graphId}/node-types/${nodeTypeId}`, { headers: headers() });
      const parsed = await parseResponse(res, nodeTypeResponse);
      return parsed.data;
    },

    async updateNodeType(graphId: string, nodeTypeId: string, input: UpdateNodeTypeInput): Promise<NodeType> {
      const body = updateNodeTypeSchema.parse(input);
      const res = await fetch(`${baseUrl}/graphs/${graphId}/node-types/${nodeTypeId}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify(body),
      });
      const parsed = await parseResponse(res, nodeTypeResponse);
      return parsed.data;
    },

    async deleteNodeType(graphId: string, nodeTypeId: string): Promise<void> {
      const res = await fetch(`${baseUrl}/graphs/${graphId}/node-types/${nodeTypeId}`, {
        method: "DELETE",
        headers: headers(),
      });
      await parseResponse(res, z.undefined());
    },

    // --- Edge Type endpoints ---

    async createEdgeType(graphId: string, input: CreateEdgeTypeInput): Promise<EdgeType> {
      const body = createEdgeTypeSchema.parse(input);
      const res = await fetch(`${baseUrl}/graphs/${graphId}/edge-types`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(body),
      });
      const parsed = await parseResponse(res, edgeTypeResponse);
      return parsed.data;
    },

    async listEdgeTypes(graphId: string): Promise<EdgeType[]> {
      const res = await fetch(`${baseUrl}/graphs/${graphId}/edge-types`, { headers: headers() });
      const parsed = await parseResponse(res, edgeTypeListResponse);
      return parsed.data;
    },

    async getEdgeType(graphId: string, edgeTypeId: string): Promise<EdgeType> {
      const res = await fetch(`${baseUrl}/graphs/${graphId}/edge-types/${edgeTypeId}`, { headers: headers() });
      const parsed = await parseResponse(res, edgeTypeResponse);
      return parsed.data;
    },

    async updateEdgeType(graphId: string, edgeTypeId: string, input: UpdateEdgeTypeInput): Promise<EdgeType> {
      const body = updateEdgeTypeSchema.parse(input);
      const res = await fetch(`${baseUrl}/graphs/${graphId}/edge-types/${edgeTypeId}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify(body),
      });
      const parsed = await parseResponse(res, edgeTypeResponse);
      return parsed.data;
    },

    async deleteEdgeType(graphId: string, edgeTypeId: string): Promise<void> {
      const res = await fetch(`${baseUrl}/graphs/${graphId}/edge-types/${edgeTypeId}`, {
        method: "DELETE",
        headers: headers(),
      });
      await parseResponse(res, z.undefined());
    },

    // --- Node Type Field endpoints ---

    async createNodeTypeField(graphId: string, nodeTypeId: string, input: CreateFieldInput): Promise<NodeTypeField> {
      const body = createFieldSchema.parse(input);
      const res = await fetch(`${baseUrl}/graphs/${graphId}/node-types/${nodeTypeId}/fields`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(body),
      });
      const parsed = await parseResponse(res, nodeTypeFieldResponse);
      return parsed.data;
    },

    async updateNodeTypeField(graphId: string, nodeTypeId: string, fieldId: string, input: UpdateFieldInput): Promise<NodeTypeField> {
      const body = updateFieldSchema.parse(input);
      const res = await fetch(`${baseUrl}/graphs/${graphId}/node-types/${nodeTypeId}/fields/${fieldId}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify(body),
      });
      const parsed = await parseResponse(res, nodeTypeFieldResponse);
      return parsed.data;
    },

    async deleteNodeTypeField(graphId: string, nodeTypeId: string, fieldId: string): Promise<void> {
      const res = await fetch(`${baseUrl}/graphs/${graphId}/node-types/${nodeTypeId}/fields/${fieldId}`, {
        method: "DELETE",
        headers: headers(),
      });
      await parseResponse(res, z.undefined());
    },

    // --- Edge Type Field endpoints ---

    async createEdgeTypeField(graphId: string, edgeTypeId: string, input: CreateFieldInput): Promise<EdgeTypeField> {
      const body = createFieldSchema.parse(input);
      const res = await fetch(`${baseUrl}/graphs/${graphId}/edge-types/${edgeTypeId}/fields`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(body),
      });
      const parsed = await parseResponse(res, edgeTypeFieldResponse);
      return parsed.data;
    },

    async updateEdgeTypeField(graphId: string, edgeTypeId: string, fieldId: string, input: UpdateFieldInput): Promise<EdgeTypeField> {
      const body = updateFieldSchema.parse(input);
      const res = await fetch(`${baseUrl}/graphs/${graphId}/edge-types/${edgeTypeId}/fields/${fieldId}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify(body),
      });
      const parsed = await parseResponse(res, edgeTypeFieldResponse);
      return parsed.data;
    },

    async deleteEdgeTypeField(graphId: string, edgeTypeId: string, fieldId: string): Promise<void> {
      const res = await fetch(`${baseUrl}/graphs/${graphId}/edge-types/${edgeTypeId}/fields/${fieldId}`, {
        method: "DELETE",
        headers: headers(),
      });
      await parseResponse(res, z.undefined());
    },
  };
}

export { ApiError };

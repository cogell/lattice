import { z } from "zod";
import {
  graphSchema,
  createGraphSchema,
  updateGraphSchema,
  type CreateGraphInput,
  type UpdateGraphInput,
  type Graph,
} from "./graphs.js";

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
  };
}

export { ApiError };

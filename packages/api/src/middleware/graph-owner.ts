import type { Context, Next } from "hono";
import { errorResponse } from "../lib/errors.js";
import type { Bindings } from "../index.js";

export type GraphRow = {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

declare module "hono" {
  interface ContextVariableMap {
    graph: GraphRow;
  }
}

/**
 * Reusable middleware: loads graph by :graphId, verifies the authenticated
 * user is the owner, and attaches the graph to context.
 */
export async function graphOwnerMiddleware(c: Context<{ Bindings: Bindings }>, next: Next) {
  const graphId = c.req.param("graphId");
  const user = c.get("user");

  const graph = await c.env.DB.prepare(
    "SELECT id, name, description, created_by, created_at, updated_at FROM graphs WHERE id = ?",
  )
    .bind(graphId)
    .first<GraphRow>();

  if (!graph) {
    return errorResponse(c, 404, "Graph not found");
  }

  if (graph.created_by !== user.id) {
    return errorResponse(c, 403, "Forbidden");
  }

  c.set("graph", graph);
  return next();
}

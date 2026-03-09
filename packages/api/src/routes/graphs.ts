import { Hono } from "hono";
import { generateId } from "../lib/id.js";
import { errorResponse } from "../lib/errors.js";
import { graphOwnerMiddleware } from "../middleware/graph-owner.js";
import { nodeTypes } from "./node-types.js";
import { edgeTypes } from "./edge-types.js";
import type { Bindings } from "../index.js";

const graphs = new Hono<{ Bindings: Bindings }>();

// POST /graphs — create a new graph
graphs.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ name?: string; description?: string }>();

  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    return errorResponse(c, 400, "Graph name is required");
  }

  const id = generateId();
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    "INSERT INTO graphs (id, name, description, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, body.name.trim(), body.description?.trim() || null, user.id, now, now)
    .run();

  return c.json(
    {
      data: {
        id,
        name: body.name.trim(),
        description: body.description?.trim() || null,
        created_by: user.id,
        created_at: now,
        updated_at: now,
      },
    },
    201,
  );
});

// GET /graphs — list graphs owned by authenticated user
graphs.get("/", async (c) => {
  const user = c.get("user");

  const result = await c.env.DB.prepare(
    "SELECT id, name, description, created_by, created_at, updated_at FROM graphs WHERE created_by = ? ORDER BY created_at DESC",
  )
    .bind(user.id)
    .all();

  return c.json({ data: result.results });
});

// All routes below require graph ownership
graphs.use("/:graphId", graphOwnerMiddleware);
graphs.use("/:graphId/*", graphOwnerMiddleware);

// GET /graphs/:graphId — get graph details
graphs.get("/:graphId", (c) => {
  return c.json({ data: c.get("graph") });
});

// PATCH /graphs/:graphId — update name/description
graphs.patch("/:graphId", async (c) => {
  const graph = c.get("graph");
  const body = await c.req.json<{ name?: string; description?: string }>();

  const name = body.name !== undefined ? body.name.trim() : graph.name;
  const description =
    body.description !== undefined ? body.description.trim() || null : graph.description;

  if (!name) {
    return errorResponse(c, 400, "Graph name cannot be empty");
  }

  const now = new Date().toISOString();

  await c.env.DB.prepare(
    "UPDATE graphs SET name = ?, description = ?, updated_at = ? WHERE id = ?",
  )
    .bind(name, description, now, graph.id)
    .run();

  return c.json({
    data: {
      id: graph.id,
      name,
      description,
      created_by: graph.created_by,
      created_at: graph.created_at,
      updated_at: now,
    },
  });
});

// Sub-routes (graph ownership already verified by middleware above)
graphs.route("/:graphId/node-types", nodeTypes);
graphs.route("/:graphId/edge-types", edgeTypes);

// DELETE /graphs/:graphId — delete graph and all related data (cascade)
graphs.delete("/:graphId", async (c) => {
  const graph = c.get("graph");

  await c.env.DB.prepare("DELETE FROM graphs WHERE id = ?").bind(graph.id).run();

  return c.body(null, 204);
});

export { graphs };

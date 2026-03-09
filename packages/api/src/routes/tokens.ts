import { Hono } from "hono";
import { generateId } from "../lib/id.js";
import { errorResponse } from "../lib/errors.js";
import type { Bindings } from "../index.js";

const tokens = new Hono<{ Bindings: Bindings }>();

// POST /settings/tokens — create a new PAT token
tokens.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ name?: string }>();

  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    return errorResponse(c, 400, "Token name is required");
  }

  // Generate token: 'lat_' + 32 hex chars (128 bits of entropy)
  const rawBytes = new Uint8Array(16);
  crypto.getRandomValues(rawBytes);
  const hex = Array.from(rawBytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  const rawToken = `lat_${hex}`;

  // Hash with SHA-256 before storage
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(rawToken),
  );
  const tokenHash = Array.from(new Uint8Array(hashBuffer), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");

  const id = generateId();
  const createdAt = new Date().toISOString();

  await c.env.DB.prepare(
    "INSERT INTO pat_tokens (id, user_id, name, token_hash, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(id, user.id, body.name.trim(), tokenHash, createdAt)
    .run();

  return c.json(
    {
      data: {
        id,
        name: body.name.trim(),
        token: rawToken,
        created_at: createdAt,
      },
    },
    201,
  );
});

// GET /settings/tokens — list the authenticated user's tokens
tokens.get("/", async (c) => {
  const user = c.get("user");

  const result = await c.env.DB.prepare(
    "SELECT id, name, created_at, last_used_at FROM pat_tokens WHERE user_id = ? ORDER BY created_at DESC",
  )
    .bind(user.id)
    .all();

  return c.json({ data: result.results });
});

// DELETE /settings/tokens/:tokenId — revoke a token
tokens.delete("/:tokenId", async (c) => {
  const user = c.get("user");
  const tokenId = c.req.param("tokenId");

  // Verify ownership
  const existing = await c.env.DB.prepare(
    "SELECT user_id FROM pat_tokens WHERE id = ?",
  )
    .bind(tokenId)
    .first<{ user_id: string }>();

  if (!existing) {
    return errorResponse(c, 404, "Token not found");
  }

  if (existing.user_id !== user.id) {
    return errorResponse(c, 403, "Forbidden");
  }

  await c.env.DB.prepare("DELETE FROM pat_tokens WHERE id = ?")
    .bind(tokenId)
    .run();

  return c.body(null, 204);
});

export { tokens };

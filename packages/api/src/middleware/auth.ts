import type { Context, Next } from "hono";
import { createAuth } from "../auth.js";
import { errorResponse } from "../lib/errors.js";

export type AuthUser = { id: string; email: string; name: string | null };

declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

const DEV_USER: AuthUser = {
  id: "01AAAAAAAAAAAAAAAAAAAADEV",
  email: "dev@lattice.local",
  name: "Dev User",
};

export async function authMiddleware(c: Context, next: Next) {
  // 1. DEV_AUTH_BYPASS — skip all auth and inject a deterministic dev user
  if (c.env.DEV_AUTH_BYPASS === "true") {
    // Ensure dev user exists in DB so FK constraints (e.g. pat_tokens) work
    await c.env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, email, name, email_verified) VALUES (?, ?, ?, 1)",
    )
      .bind(DEV_USER.id, DEV_USER.email, DEV_USER.name)
      .run();
    c.set("user", DEV_USER);
    return next();
  }

  // 2. Session cookie (via BetterAuth)
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });
  if (session) {
    c.set("user", {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    });
    return next();
  }

  // 3. Bearer token (PAT)
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const rawToken = authHeader.slice(7);
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(rawToken),
    );
    const tokenHash = Array.from(new Uint8Array(hashBuffer), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");

    const result = await c.env.DB.prepare(
      "SELECT pt.id AS token_id, pt.user_id, u.email, u.name FROM pat_tokens pt JOIN users u ON u.id = pt.user_id WHERE pt.token_hash = ?",
    )
      .bind(tokenHash)
      .first<{
        token_id: string;
        user_id: string;
        email: string;
        name: string | null;
      }>();

    if (result) {
      // Update last_used_at without blocking the response
      c.executionCtx.waitUntil(
        c.env.DB.prepare(
          "UPDATE pat_tokens SET last_used_at = ? WHERE id = ?",
        )
          .bind(new Date().toISOString(), result.token_id)
          .run(),
      );
      c.set("user", {
        id: result.user_id,
        email: result.email,
        name: result.name,
      });
      return next();
    }
  }

  return errorResponse(c, 401, "Authentication required");
}

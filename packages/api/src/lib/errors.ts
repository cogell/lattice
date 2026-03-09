import type { Context } from "hono";

export function errorResponse(c: Context, status: number, message: string) {
  return c.json({ error: { status, message } }, status as StatusCode);
}

type StatusCode = 400 | 401 | 403 | 404 | 409 | 422 | 500;

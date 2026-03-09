import { Hono } from "hono";
import { health } from "./routes/health.js";
import { createAuth } from "./auth.js";
import { authMiddleware } from "./middleware/auth.js";
import { tokens } from "./routes/tokens.js";
import { graphs } from "./routes/graphs.js";

export type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
  BETTER_AUTH_SECRET: string;
  RESEND_API_KEY: string;
  DEV_AUTH_BYPASS?: string;
  AUTH_ORIGIN?: string;
  RESEND_FROM_EMAIL?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// BetterAuth handles sign-in, sign-out, magic link, session management
app.on(["GET", "POST"], "/api/auth/*", (c) => {
  const auth = createAuth(c.env);
  return auth.handler(c.req.raw);
});

// Public routes (no auth required)
const api = new Hono<{ Bindings: Bindings }>();
api.route("/", health);

// Protected routes (auth required)
const protectedApi = new Hono<{ Bindings: Bindings }>();
protectedApi.use("*", authMiddleware);
protectedApi.get("/me", (c) => c.json({ data: c.get("user") }));
protectedApi.route("/settings/tokens", tokens);
protectedApi.route("/graphs", graphs);

api.route("/", protectedApi);

app.route("/api/v1", api);

// SPA catch-all: forward non-API requests to Workers Assets
app.all("*", async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;

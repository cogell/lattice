import { Hono } from "hono";
import { health } from "./routes/health.js";

type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
};

const app = new Hono<{ Bindings: Bindings }>();

const api = new Hono<{ Bindings: Bindings }>();
api.route("/", health);

app.route("/api/v1", api);

// SPA catch-all: forward non-API requests to Workers Assets
app.all("*", async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;

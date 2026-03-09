import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import "../src/index";

describe("Health endpoint", () => {
  it("GET /api/v1/health returns 200", async () => {
    const res = await SELF.fetch("http://localhost/api/v1/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });
});

import { env, SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import "../src/index";

describe("Auth middleware", () => {
  it("DEV_AUTH_BYPASS injects dev user on /me", async () => {
    const res = await SELF.fetch("http://localhost/api/v1/me");
    expect(res.status).toBe(200);
    const body = await res.json<{ data: { id: string; email: string; name: string } }>();
    expect(body.data).toEqual({
      id: "01AAAAAAAAAAAAAAAAAAAADEV",
      email: "dev@lattice.local",
      name: "Dev User",
    });
  });

  it("health endpoint is public (no auth required)", async () => {
    const res = await SELF.fetch("http://localhost/api/v1/health");
    expect(res.status).toBe(200);
    const body = await res.json<{ status: string }>();
    expect(body.status).toBe("ok");
  });

  it("BetterAuth routes are mounted at /api/auth/*", async () => {
    // get-session with no cookie should return null session, not 404
    const res = await SELF.fetch("http://localhost/api/auth/get-session");
    expect(res.status).toBe(200);
  });
});

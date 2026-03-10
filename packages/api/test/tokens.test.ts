import { env, SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";

// Helper to create a token via API (uses DEV_AUTH_BYPASS)
async function createToken(name: string) {
  const res = await SELF.fetch("http://localhost/api/v1/settings/tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return {
    status: res.status,
    body: await res.json<{
      data: { id: string; name: string; token: string; created_at: string };
    }>(),
  };
}

// Helper to list tokens
async function listTokens() {
  const res = await SELF.fetch("http://localhost/api/v1/settings/tokens");
  return {
    status: res.status,
    body: await res.json<{
      data: Array<{
        id: string;
        name: string;
        created_at: string;
        last_used_at: string | null;
      }>;
    }>(),
  };
}

function createExecutionContextStub() {
  const tasks: Promise<unknown>[] = [];
  const executionCtx = {
    waitUntil(promise: Promise<unknown>) {
      tasks.push(promise);
    },
    passThroughOnException() {},
  } as ExecutionContext;

  return {
    executionCtx,
    async waitForTasks() {
      await Promise.all(tasks);
    },
  };
}

async function requestWithoutBypass(path: string, init?: RequestInit) {
  const ctx = createExecutionContextStub();
  const response = await app.request(
    `http://localhost${path}`,
    init,
    { ...env, DEV_AUTH_BYPASS: "false" },
    ctx.executionCtx,
  );
  return { response, waitForTasks: ctx.waitForTasks };
}

// Helper to delete a token
async function deleteToken(tokenId: string) {
  return SELF.fetch(`http://localhost/api/v1/settings/tokens/${tokenId}`, {
    method: "DELETE",
  });
}

describe("PAT token CRUD", () => {
  it("POST creates token with 201 and lat_ prefix", async () => {
    const { status, body } = await createToken("my-token");
    expect(status).toBe(201);
    expect(body.data.name).toBe("my-token");
    expect(body.data.token).toMatch(/^lat_[0-9a-f]{32}$/);
    expect(body.data.id).toBeTruthy();
    expect(body.data.created_at).toBeTruthy();
  });

  it("POST rejects missing name with 400", async () => {
    const res = await SELF.fetch("http://localhost/api/v1/settings/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json<{ error: { status: number; message: string } }>();
    expect(body.error.status).toBe(400);
    expect(body.error.message).toContain("name");
  });

  it("POST rejects empty name with 400", async () => {
    const res = await SELF.fetch("http://localhost/api/v1/settings/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "  " }),
    });
    expect(res.status).toBe(400);
  });

  it("GET lists tokens without exposing hash", async () => {
    await createToken("list-test");
    const { status, body } = await listTokens();
    expect(status).toBe(200);
    expect(body.data).toHaveLength(1);
    const token = body.data.find((t) => t.name === "list-test");
    expect(token).toBeTruthy();
    // Ensure no hash or raw token in response
    expect(token).not.toHaveProperty("token_hash");
    expect(token).not.toHaveProperty("token");
  });

  it("DELETE returns 204", async () => {
    const { body } = await createToken("delete-me");
    const res = await deleteToken(body.data.id);
    expect(res.status).toBe(204);
  });

  it("deleted token no longer in list", async () => {
    const { body } = await createToken("ephemeral");
    await deleteToken(body.data.id);
    const { body: listBody } = await listTokens();
    const found = listBody.data.find((t) => t.id === body.data.id);
    expect(found).toBeUndefined();
  });

  it("DELETE nonexistent token returns 404", async () => {
    const res = await deleteToken("nonexistent-id");
    expect(res.status).toBe(404);
  });
});

describe("Bearer auth", () => {
  it("valid Bearer token authenticates request when DEV_AUTH_BYPASS is disabled", async () => {
    const { body } = await createToken("bearer-test");
    const rawToken = body.data.token;

    const { response, waitForTasks } = await requestWithoutBypass("/api/v1/me", {
      headers: { Authorization: `Bearer ${rawToken}` },
    });
    expect(response.status).toBe(200);
    const meBody = await response.json<{ data: { id: string; email: string } }>();
    expect(meBody.data.id).toBe("01AAAAAAAAAAAAAAAAAAAADEV");
    expect(meBody.data.email).toBe("dev@lattice.local");
    await waitForTasks();
  });

  it("invalid Bearer token returns 401 when DEV_AUTH_BYPASS is disabled", async () => {
    const { response } = await requestWithoutBypass("/api/v1/me", {
      headers: { Authorization: "Bearer garbage_token" },
    });
    expect(response.status).toBe(401);
    const body = await response.json<{ error: { status: number; message: string } }>();
    expect(body.error.message).toBe("Authentication required");
  });

  it("successful Bearer auth updates last_used_at when DEV_AUTH_BYPASS is disabled", async () => {
    const { body } = await createToken("last-used-test");
    const tokenId = body.data.id;

    const before = await env.DB.prepare(
      "SELECT last_used_at FROM pat_tokens WHERE id = ?",
    )
      .bind(tokenId)
      .first<{ last_used_at: string | null }>();
    expect(before?.last_used_at).toBeNull();

    const { response, waitForTasks } = await requestWithoutBypass("/api/v1/me", {
      headers: { Authorization: `Bearer ${body.data.token}` },
    });
    expect(response.status).toBe(200);

    await waitForTasks();

    const after = await env.DB.prepare(
      "SELECT last_used_at FROM pat_tokens WHERE id = ?",
    )
      .bind(tokenId)
      .first<{ last_used_at: string | null }>();
    expect(after?.last_used_at).toBeTruthy();
  });
});

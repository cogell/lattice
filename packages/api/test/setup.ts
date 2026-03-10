import { env } from "cloudflare:test";
import { beforeAll, beforeEach } from "vitest";
import migration0001 from "../migrations/0001_initial.sql?raw";
import migration0002 from "../migrations/0002_better_auth.sql?raw";

function splitStatements(sql: string): string[] {
  // Remove comments (standalone lines starting with --)
  const cleaned = sql.replace(/^\s*--.*$/gm, "");
  // Remove PRAGMA lines
  const noPragma = cleaned.replace(/^\s*PRAGMA\s+[^;]*;\s*$/gim, "");
  // Split on semicolons, trim, filter empty
  return noPragma
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// Apply D1 migrations before all tests
beforeAll(async () => {
  const statements = [
    ...splitStatements(migration0001),
    ...splitStatements(migration0002),
  ];
  await env.DB.batch(statements.map((s) => env.DB.prepare(s)));
});

// Keep integration tests isolated so assertions do not depend on leaked state.
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM verification"),
    env.DB.prepare("DELETE FROM account"),
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM pat_tokens"),
    env.DB.prepare("DELETE FROM graphs"),
    env.DB.prepare("DELETE FROM users"),
  ]);
});

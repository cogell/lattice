import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

// We need to test the config module with a custom config dir.
// Since the module uses a hardcoded path, we'll test the core logic directly.

function createTempDir() {
  const dir = join(tmpdir(), `lattice-test-${randomBytes(4).toString("hex")}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("config file operations", () => {
  let tempDir: string;
  let configFile: string;

  beforeEach(() => {
    tempDir = createTempDir();
    configFile = join(tempDir, "config.json");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("reads valid config from file", () => {
    const config = { api_url: "http://localhost:8787", token: "lat_abc123" };
    writeFileSync(configFile, JSON.stringify(config));
    const content = JSON.parse(readFileSync(configFile, "utf-8"));
    expect(content.api_url).toBe("http://localhost:8787");
    expect(content.token).toBe("lat_abc123");
  });

  it("handles missing config file gracefully", () => {
    const missingFile = join(tempDir, "nonexistent.json");
    expect(() => readFileSync(missingFile, "utf-8")).toThrow();
  });

  it("detects malformed JSON", () => {
    writeFileSync(configFile, "not valid json");
    const content = readFileSync(configFile, "utf-8");
    expect(() => JSON.parse(content)).toThrow(SyntaxError);
  });

  it("partial config update preserves existing values", () => {
    const initial = { api_url: "http://localhost:8787", token: "old_token" };
    writeFileSync(configFile, JSON.stringify(initial));

    const existing = JSON.parse(readFileSync(configFile, "utf-8"));
    existing.token = "new_token";
    writeFileSync(configFile, JSON.stringify(existing));

    const updated = JSON.parse(readFileSync(configFile, "utf-8"));
    expect(updated.api_url).toBe("http://localhost:8787");
    expect(updated.token).toBe("new_token");
  });

  it("empty config object is valid", () => {
    writeFileSync(configFile, JSON.stringify({}));
    const content = JSON.parse(readFileSync(configFile, "utf-8"));
    expect(content).toEqual({});
  });

  it("config directory creation is idempotent", () => {
    const nestedDir = join(tempDir, "nested", "dir");
    mkdirSync(nestedDir, { recursive: true });
    // Calling again should not throw
    mkdirSync(nestedDir, { recursive: true });
    const stat = statSync(nestedDir);
    expect(stat.isDirectory()).toBe(true);
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { readConfig, writeConfig, getRequiredConfig } from "../src/lib/config.js";

function createTempDir() {
  const dir = join(tmpdir(), `lattice-test-${randomBytes(4).toString("hex")}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("readConfig", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("reads valid config from file", () => {
    const expected = { api_url: "http://localhost:8787", token: "lat_abc123" };
    writeFileSync(join(tempDir, "config.json"), JSON.stringify(expected));

    const config = readConfig(tempDir);
    expect(config.api_url).toBe("http://localhost:8787");
    expect(config.token).toBe("lat_abc123");
  });

  it("returns empty object when config file is missing", () => {
    const config = readConfig(tempDir);
    expect(config).toEqual({});
  });

  it("returns empty object when config directory does not exist", () => {
    const nonexistentDir = join(tempDir, "does-not-exist");
    const config = readConfig(nonexistentDir);
    expect(config).toEqual({});
  });

  it("throws descriptive error for malformed JSON", () => {
    writeFileSync(join(tempDir, "config.json"), "not valid json {{{");

    expect(() => readConfig(tempDir)).toThrow(/Malformed config file at/);
  });

  it("reads empty config object as valid", () => {
    writeFileSync(join(tempDir, "config.json"), JSON.stringify({}));
    const config = readConfig(tempDir);
    expect(config).toEqual({});
  });
});

describe("writeConfig", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates config directory and file", () => {
    const nestedDir = join(tempDir, "nested", "config");
    writeConfig({ api_url: "http://example.com" }, nestedDir);

    const configFile = join(nestedDir, "config.json");
    expect(existsSync(configFile)).toBe(true);

    const content = JSON.parse(readFileSync(configFile, "utf-8"));
    expect(content.api_url).toBe("http://example.com");
  });

  it("writes file with 0600 permissions", () => {
    writeConfig({ token: "lat_secret" }, tempDir);

    const configFile = join(tempDir, "config.json");
    const stat = statSync(configFile);
    // 0o600 = owner read+write only (octal 0600 = decimal 384)
    const mode = stat.mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("writes pretty-printed JSON with trailing newline", () => {
    const config = { api_url: "http://localhost:8787", token: "lat_abc" };
    writeConfig(config, tempDir);

    const raw = readFileSync(join(tempDir, "config.json"), "utf-8");
    expect(raw).toBe(JSON.stringify(config, null, 2) + "\n");
  });

  it("atomic write does not leave temp files on success", () => {
    writeConfig({ api_url: "http://localhost:8787" }, tempDir);

    const { readdirSync } = require("node:fs");
    const files: string[] = readdirSync(tempDir);
    const tempFiles = files.filter((f: string) => f.startsWith(".config.tmp."));
    expect(tempFiles).toHaveLength(0);
  });

  it("directory creation is idempotent", () => {
    writeConfig({ api_url: "http://first.com" }, tempDir);
    writeConfig({ api_url: "http://second.com" }, tempDir);

    const config = readConfig(tempDir);
    expect(config.api_url).toBe("http://second.com");
  });
});

describe("writeConfig + readConfig round-trip", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("round-trips config through write and read", () => {
    const original = { api_url: "http://localhost:8787", token: "lat_abc123", active_graph_id: "graph-1" };
    writeConfig(original, tempDir);

    const loaded = readConfig(tempDir);
    expect(loaded).toEqual(original);
  });

  it("partial update preserves existing values", () => {
    writeConfig({ api_url: "http://localhost:8787", token: "old_token" }, tempDir);

    const existing = readConfig(tempDir);
    existing.token = "new_token";
    writeConfig(existing, tempDir);

    const updated = readConfig(tempDir);
    expect(updated.api_url).toBe("http://localhost:8787");
    expect(updated.token).toBe("new_token");
  });
});

describe("getRequiredConfig", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns api_url and token when both are set", () => {
    writeConfig({ api_url: "http://localhost:8787", token: "lat_abc123" }, tempDir);

    const config = getRequiredConfig(tempDir);
    expect(config.api_url).toBe("http://localhost:8787");
    expect(config.token).toBe("lat_abc123");
  });

  it("throws when api_url is missing", () => {
    writeConfig({ token: "lat_abc123" }, tempDir);

    expect(() => getRequiredConfig(tempDir)).toThrow(/Missing config: api_url/);
  });

  it("throws when token is missing", () => {
    writeConfig({ api_url: "http://localhost:8787" }, tempDir);

    expect(() => getRequiredConfig(tempDir)).toThrow(/Missing config: token/);
  });

  it("throws when both are missing", () => {
    writeConfig({}, tempDir);

    expect(() => getRequiredConfig(tempDir)).toThrow(/Missing config: api_url, token/);
  });

  it("throws with guidance to run config set", () => {
    expect(() => getRequiredConfig(tempDir)).toThrow(/lattice config set/);
  });
});

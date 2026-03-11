import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";

export interface LatticeConfig {
  api_url?: string;
  token?: string;
  active_graph_id?: string;
}

const DEFAULT_CONFIG_DIR = join(homedir(), ".lattice");

function resolveConfigPaths(configDir?: string) {
  const dir = configDir ?? DEFAULT_CONFIG_DIR;
  return { dir, file: join(dir, "config.json") };
}

export function readConfig(configDir?: string): LatticeConfig {
  const { file } = resolveConfigPaths(configDir);
  try {
    const content = readFileSync(file, "utf-8");
    return JSON.parse(content) as LatticeConfig;
  } catch (err: unknown) {
    if (err instanceof SyntaxError) {
      throw new Error(
        `Malformed config file at ${file}: ${err.message}`,
      );
    }
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") {
      return {};
    }
    throw err;
  }
}

export function writeConfig(config: LatticeConfig, configDir?: string): void {
  const { dir, file } = resolveConfigPaths(configDir);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmpFile = join(
    dir,
    `.config.tmp.${randomBytes(4).toString("hex")}`,
  );
  writeFileSync(tmpFile, JSON.stringify(config, null, 2) + "\n", {
    mode: 0o600,
  });
  renameSync(tmpFile, file);
}

export function getRequiredConfig(configDir?: string): { api_url: string; token: string } {
  const config = readConfig(configDir);
  if (!config.api_url || !config.token) {
    const missing: string[] = [];
    if (!config.api_url) missing.push("api_url");
    if (!config.token) missing.push("token");
    throw new Error(
      `Missing config: ${missing.join(", ")}. Run 'lattice config set --api-url <url> --token <token>' first.`,
    );
  }
  return { api_url: config.api_url, token: config.token };
}

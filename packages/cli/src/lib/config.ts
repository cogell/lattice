import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";

export interface LatticeConfig {
  api_url?: string;
  token?: string;
  active_graph_id?: string;
}

const CONFIG_DIR = join(homedir(), ".lattice");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export function readConfig(): LatticeConfig {
  try {
    const content = readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(content) as LatticeConfig;
  } catch (err: unknown) {
    if (err instanceof SyntaxError) {
      throw new Error(
        `Malformed config file at ${CONFIG_FILE}: ${err.message}`,
      );
    }
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") {
      return {};
    }
    throw err;
  }
}

export function writeConfig(config: LatticeConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const tmpFile = join(
    CONFIG_DIR,
    `.config.tmp.${randomBytes(4).toString("hex")}`,
  );
  writeFileSync(tmpFile, JSON.stringify(config, null, 2) + "\n", {
    mode: 0o600,
  });
  renameSync(tmpFile, CONFIG_FILE);
}

export function getRequiredConfig(): { api_url: string; token: string } {
  const config = readConfig();
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

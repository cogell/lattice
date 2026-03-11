import type { Command } from "commander";
import { readConfig, writeConfig } from "../lib/config.js";
import { handleError, isJsonMode, isQuietMode, printJson, printQuietId, printEntityTable } from "../lib/output.js";

function maskToken(token: string): string {
  if (token.length <= 8) return "****";
  return token.slice(0, 4) + "****…" + token.slice(-4);
}

export function registerConfigCommands(program: Command) {
  const config = program.command("config").description("Manage CLI configuration");

  config
    .command("set")
    .description("Set configuration values")
    .option("--api-url <url>", "API server URL")
    .option("--token <token>", "Authentication token")
    .action(async (opts, cmd) => {
      try {
        if (!opts.apiUrl && !opts.token) {
          throw new Error("Provide at least one of --api-url or --token");
        }
        let existing: ReturnType<typeof readConfig>;
        try {
          existing = readConfig();
        } catch {
          existing = {};
        }
        if (opts.apiUrl) existing.api_url = opts.apiUrl;
        if (opts.token) existing.token = opts.token;
        writeConfig(existing);

        if (isQuietMode(cmd)) {
          printQuietId("ok");
        } else if (isJsonMode(cmd)) {
          printJson({ success: true });
        } else {
          console.log("Configuration updated.");
        }
      } catch (err) {
        handleError(err, cmd);
      }
    });

  config
    .command("get")
    .description("Get a configuration value")
    .argument("<key>", "Config key (api_url, token, active_graph_id)")
    .action(async (key, _opts, cmd) => {
      try {
        const cfg = readConfig();
        const value = cfg[key as keyof typeof cfg];
        if (value === undefined) {
          throw new Error(`Config key '${key}' is not set`);
        }
        if (isJsonMode(cmd)) {
          printJson({ [key]: value });
        } else {
          console.log(value);
        }
      } catch (err) {
        handleError(err, cmd);
      }
    });

  config
    .command("show")
    .description("Show all configuration")
    .action(async (_opts, cmd) => {
      try {
        const cfg = readConfig();
        const display: Record<string, string> = {};
        display.api_url = cfg.api_url ?? "(not set)";
        display.token = cfg.token ? maskToken(cfg.token) : "(not set)";
        display.active_graph_id = cfg.active_graph_id ?? "(not set)";

        if (isJsonMode(cmd)) {
          printJson(display);
        } else {
          printEntityTable(display, ["api_url", "token", "active_graph_id"]);
        }
      } catch (err) {
        handleError(err, cmd);
      }
    });
}

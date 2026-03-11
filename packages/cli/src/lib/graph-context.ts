import type { Command } from "commander";
import { readConfig } from "./config.js";

export function resolveGraphId(cmd: Command): string {
  const graphFlag = cmd.optsWithGlobals().graph;
  if (graphFlag) return graphFlag;

  const config = readConfig();
  if (config.active_graph_id) return config.active_graph_id;

  throw new Error(
    "No graph specified. Use --graph <id> or run 'lattice graphs use <id>' to set a default.",
  );
}

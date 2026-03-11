#!/usr/bin/env node
import { Command } from "commander";
import { registerConfigCommands } from "./commands/config.js";
import { registerGraphCommands } from "./commands/graphs.js";
import { registerNodeTypeCommands } from "./commands/node-types.js";
import { registerEdgeTypeCommands } from "./commands/edge-types.js";
import { registerNodeCommands } from "./commands/nodes.js";
import { registerEdgeCommands } from "./commands/edges.js";
import { registerImportCommands } from "./commands/import.js";
import { registerExportCommands } from "./commands/export.js";

const program = new Command();

program
  .name("lattice")
  .description("CLI for Lattice graph database")
  .version("0.0.0")
  .option("--json", "Output results as JSON")
  .option("--graph <id>", "Graph ID (overrides active graph context)");

registerConfigCommands(program);
registerGraphCommands(program);
registerNodeTypeCommands(program);
registerEdgeTypeCommands(program);
registerNodeCommands(program);
registerEdgeCommands(program);
registerImportCommands(program);
registerExportCommands(program);

program.parse();

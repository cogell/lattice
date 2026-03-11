import type { Command } from "commander";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getClient } from "../lib/client.js";
import { resolveGraphId } from "../lib/graph-context.js";
import { handleError, isJsonMode, printJson } from "../lib/output.js";

export function registerExportCommands(program: Command) {
  const exp = program.command("export").description("Export data to CSV");

  exp
    .command("nodes")
    .description("Export nodes as CSV")
    .requiredOption("--type <id>", "Node type ID")
    .option("--output <path>", "Write to file instead of stdout")
    .action(async (opts, cmd) => {
      try {
        const graphId = resolveGraphId(cmd);
        const client = getClient();

        if (isJsonMode(cmd)) {
          // In JSON mode, use the list endpoint instead
          const result = await client.listNodes(graphId, opts.type, {
            limit: 100,
          });
          printJson(result);
          return;
        }

        const blob = await client.exportNodes(graphId, opts.type);
        const csv = await blob.text();

        if (opts.output) {
          writeFileSync(resolve(opts.output), csv);
          console.error(`Exported to ${resolve(opts.output)}`);
        } else {
          process.stdout.write(csv);
        }
      } catch (err) {
        handleError(err, cmd);
      }
    });

  exp
    .command("edges")
    .description("Export edges as CSV")
    .requiredOption("--type <id>", "Edge type ID")
    .option("--output <path>", "Write to file instead of stdout")
    .action(async (opts, cmd) => {
      try {
        const graphId = resolveGraphId(cmd);
        const client = getClient();

        if (isJsonMode(cmd)) {
          const result = await client.listEdges(graphId, opts.type, {
            limit: 100,
          });
          printJson(result);
          return;
        }

        const blob = await client.exportEdges(graphId, opts.type);
        const csv = await blob.text();

        if (opts.output) {
          writeFileSync(resolve(opts.output), csv);
          console.error(`Exported to ${resolve(opts.output)}`);
        } else {
          process.stdout.write(csv);
        }
      } catch (err) {
        handleError(err, cmd);
      }
    });
}

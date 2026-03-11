import type { Command } from "commander";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getClient } from "../lib/client.js";
import { resolveGraphId } from "../lib/graph-context.js";
import { handleError, isJsonMode, printJson } from "../lib/output.js";
import type { ListOptions, PaginatedResult } from "@lattice/shared";

/**
 * Paginate through all results from a paginated list endpoint,
 * collecting every item into a single array.
 */
async function fetchAll<T>(
  fetcher: (opts: ListOptions) => Promise<PaginatedResult<T>>,
): Promise<T[]> {
  const PAGE_SIZE = 100;
  const allItems: T[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const result = await fetcher({ limit: PAGE_SIZE, offset });
    allItems.push(...result.data);
    hasMore = result.pagination.has_more;
    offset += PAGE_SIZE;
  }

  return allItems;
}

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
          // In JSON mode, paginate through ALL results
          const data = await fetchAll((pageOpts) =>
            client.listNodes(graphId, opts.type, pageOpts),
          );
          printJson({ data });
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
          // In JSON mode, paginate through ALL results
          const data = await fetchAll((pageOpts) =>
            client.listEdges(graphId, opts.type, pageOpts),
          );
          printJson({ data });
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

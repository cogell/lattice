import type { Command } from "commander";
import type { ListOptions } from "@lattice/shared";
import { getClient } from "../lib/client.js";
import { resolveGraphId } from "../lib/graph-context.js";
import {
  parseFilter,
  filtersToApiFormat,
  parseSort,
} from "../lib/filter-parser.js";
import {
  handleError,
  isJsonMode,
  printJson,
  printTable,
  printEntityTable,
  printPagination,
  printSuccess,
} from "../lib/output.js";

function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

export function registerNodeCommands(program: Command) {
  const nodes = program.command("nodes").description("Manage nodes");

  nodes
    .command("list")
    .description("List nodes")
    .requiredOption("--type <id>", "Node type ID")
    .option("--filter <filter>", "Filter (field_slug[op]=value)", collect, [])
    .option("--sort <sort>", "Sort (field_slug:asc or field_slug:desc)")
    .option("--limit <n>", "Max results", "50")
    .option("--offset <n>", "Results offset", "0")
    .action(async (opts, cmd) => {
      try {
        const graphId = resolveGraphId(cmd);
        const client = getClient();

        const listOpts: ListOptions = {
          limit: parseInt(opts.limit),
          offset: parseInt(opts.offset),
        };

        if (opts.filter.length > 0) {
          const parsed = opts.filter.map(parseFilter);
          listOpts.filters = filtersToApiFormat(parsed);
        }
        if (opts.sort) {
          const s = parseSort(opts.sort);
          listOpts.sort = `${s.field}:${s.direction}`;
        }

        const result = await client.listNodes(graphId, opts.type, listOpts);

        if (isJsonMode(cmd)) {
          printJson(result);
        } else {
          // Fetch field definitions for dynamic columns
          const fields = await client.listNodeTypeFields(graphId, opts.type);
          const fieldHeaders = fields.map((f) => f.name);
          const fieldSlugs = fields.map((f) => f.slug);

          printTable(
            ["ID", ...fieldHeaders],
            result.data.map((n) => [
              n.id,
              ...fieldSlugs.map((slug) => {
                const val = n.data[slug];
                if (val === null || val === undefined) return "";
                if (Array.isArray(val)) return val.join(", ");
                return String(val);
              }),
            ]),
          );
          printPagination(
            result.pagination.offset,
            result.pagination.limit,
            result.pagination.total,
          );
        }
      } catch (err) {
        handleError(err, cmd);
      }
    });

  nodes
    .command("create")
    .description("Create a node")
    .requiredOption("--type <id>", "Node type ID")
    .requiredOption("--data <json>", "Field values as JSON")
    .action(async (opts, cmd) => {
      try {
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(opts.data);
        } catch {
          throw new Error(
            `Invalid JSON in --data: ${opts.data}\nExpected format: '{"field_slug": "value"}'`,
          );
        }

        const graphId = resolveGraphId(cmd);
        const client = getClient();
        const node = await client.createNode(graphId, {
          node_type_id: opts.type,
          data,
        });
        if (isJsonMode(cmd)) {
          printJson(node);
        } else {
          printEntityTable(
            { ...node, data: JSON.stringify(node.data) },
            ["id", "node_type_id", "data", "created_at"],
          );
        }
      } catch (err) {
        handleError(err, cmd);
      }
    });

  nodes
    .command("get")
    .description("Get a node")
    .argument("<nodeId>", "Node ID")
    .action(async (nodeId, _opts, cmd) => {
      try {
        const graphId = resolveGraphId(cmd);
        const client = getClient();
        const node = await client.getNode(graphId, nodeId);
        if (isJsonMode(cmd)) {
          printJson(node);
        } else {
          // Display node fields individually
          const entries: Record<string, string> = {
            id: node.id,
            node_type_id: node.node_type_id,
          };
          for (const [k, v] of Object.entries(node.data)) {
            entries[`data.${k}`] =
              v === null || v === undefined
                ? ""
                : Array.isArray(v)
                  ? v.join(", ")
                  : String(v);
          }
          entries.created_at = node.created_at;
          entries.updated_at = node.updated_at;
          printEntityTable(entries, Object.keys(entries));
        }
      } catch (err) {
        handleError(err, cmd);
      }
    });

  nodes
    .command("update")
    .description("Update a node")
    .argument("<nodeId>", "Node ID")
    .requiredOption("--data <json>", "Field values as JSON (partial update)")
    .action(async (nodeId, opts, cmd) => {
      try {
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(opts.data);
        } catch {
          throw new Error(
            `Invalid JSON in --data: ${opts.data}\nExpected format: '{"field_slug": "value"}'`,
          );
        }

        const graphId = resolveGraphId(cmd);
        const client = getClient();
        const node = await client.updateNode(graphId, nodeId, { data });
        if (isJsonMode(cmd)) {
          printJson(node);
        } else {
          printEntityTable(
            { ...node, data: JSON.stringify(node.data) },
            ["id", "node_type_id", "data", "updated_at"],
          );
        }
      } catch (err) {
        handleError(err, cmd);
      }
    });

  nodes
    .command("delete")
    .description("Delete a node")
    .argument("<nodeId>", "Node ID")
    .action(async (nodeId, _opts, cmd) => {
      try {
        const graphId = resolveGraphId(cmd);
        const client = getClient();
        await client.deleteNode(graphId, nodeId);
        if (isJsonMode(cmd)) {
          printJson({ deleted: true, id: nodeId });
        } else {
          printSuccess(
            `Deleted node ${nodeId} (connected edges also deleted)`,
          );
        }
      } catch (err) {
        handleError(err, cmd);
      }
    });
}

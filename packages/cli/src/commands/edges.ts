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

export function registerEdgeCommands(program: Command) {
  const edges = program.command("edges").description("Manage edges");

  edges
    .command("list")
    .description("List edges")
    .requiredOption("--type <id>", "Edge type ID")
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

        const result = await client.listEdges(graphId, opts.type, listOpts);

        if (isJsonMode(cmd)) {
          printJson(result);
        } else {
          const fields = await client.listEdgeTypeFields(graphId, opts.type);
          const fieldHeaders = fields.map((f) => f.name);
          const fieldSlugs = fields.map((f) => f.slug);

          printTable(
            ["ID", "Source", "Target", ...fieldHeaders],
            result.data.map((e) => [
              e.id,
              e.source_node_id,
              e.target_node_id,
              ...fieldSlugs.map((slug) => {
                const val = e.data[slug];
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

  edges
    .command("create")
    .description("Create an edge")
    .requiredOption("--type <id>", "Edge type ID")
    .requiredOption("--source <id>", "Source node ID")
    .requiredOption("--target <id>", "Target node ID")
    .option("--data <json>", "Field values as JSON")
    .action(async (opts, cmd) => {
      try {
        let data: Record<string, unknown> = {};
        if (opts.data) {
          try {
            data = JSON.parse(opts.data);
          } catch {
            throw new Error(
              `Invalid JSON in --data: ${opts.data}\nExpected format: '{"field_slug": "value"}'`,
            );
          }
        }

        const graphId = resolveGraphId(cmd);
        const client = getClient();
        const edge = await client.createEdge(graphId, {
          edge_type_id: opts.type,
          source_node_id: opts.source,
          target_node_id: opts.target,
          data,
        });
        if (isJsonMode(cmd)) {
          printJson(edge);
        } else {
          printEntityTable(
            { ...edge, data: JSON.stringify(edge.data) },
            [
              "id",
              "edge_type_id",
              "source_node_id",
              "target_node_id",
              "data",
              "created_at",
            ],
          );
        }
      } catch (err) {
        handleError(err, cmd);
      }
    });

  edges
    .command("get")
    .description("Get an edge")
    .argument("<edgeId>", "Edge ID")
    .action(async (edgeId, _opts, cmd) => {
      try {
        const graphId = resolveGraphId(cmd);
        const client = getClient();
        const edge = await client.getEdge(graphId, edgeId);
        if (isJsonMode(cmd)) {
          printJson(edge);
        } else {
          const entries: Record<string, string> = {
            id: edge.id,
            edge_type_id: edge.edge_type_id,
            source_node_id: edge.source_node_id,
            target_node_id: edge.target_node_id,
          };
          for (const [k, v] of Object.entries(edge.data)) {
            entries[`data.${k}`] =
              v === null || v === undefined
                ? ""
                : Array.isArray(v)
                  ? v.join(", ")
                  : String(v);
          }
          entries.created_at = edge.created_at;
          entries.updated_at = edge.updated_at;
          printEntityTable(entries, Object.keys(entries));
        }
      } catch (err) {
        handleError(err, cmd);
      }
    });

  edges
    .command("update")
    .description("Update an edge")
    .argument("<edgeId>", "Edge ID")
    .requiredOption("--data <json>", "Field values as JSON (partial update)")
    .action(async (edgeId, opts, cmd) => {
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
        const edge = await client.updateEdge(graphId, edgeId, { data });
        if (isJsonMode(cmd)) {
          printJson(edge);
        } else {
          printEntityTable(
            { ...edge, data: JSON.stringify(edge.data) },
            ["id", "edge_type_id", "data", "updated_at"],
          );
        }
      } catch (err) {
        handleError(err, cmd);
      }
    });

  edges
    .command("delete")
    .description("Delete an edge")
    .argument("<edgeId>", "Edge ID")
    .action(async (edgeId, _opts, cmd) => {
      try {
        const graphId = resolveGraphId(cmd);
        const client = getClient();
        await client.deleteEdge(graphId, edgeId);
        if (isJsonMode(cmd)) {
          printJson({ deleted: true, id: edgeId });
        } else {
          printSuccess(`Deleted edge ${edgeId}`);
        }
      } catch (err) {
        handleError(err, cmd);
      }
    });
}

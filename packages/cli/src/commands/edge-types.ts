import type { Command } from "commander";
import { getClient } from "../lib/client.js";
import { registerFieldSubcommands } from "../lib/field-commands.js";
import { resolveGraphId } from "../lib/graph-context.js";
import {
  handleError,
  isJsonMode,
  printJson,
  printTable,
  printEntityTable,
  printSuccess,
} from "../lib/output.js";

export function registerEdgeTypeCommands(program: Command) {
  const edgeTypes = program
    .command("edge-types")
    .description("Manage edge types");

  edgeTypes
    .command("list")
    .description("List edge types")
    .action(async (_opts, cmd) => {
      try {
        const graphId = resolveGraphId(cmd);
        const client = getClient();
        const types = await client.listEdgeTypes(graphId);
        if (isJsonMode(cmd)) {
          printJson(types);
        } else {
          printTable(
            ["ID", "Name", "Slug", "Directed", "Source Type", "Target Type"],
            types.map((t) => [
              t.id,
              t.name,
              t.slug,
              t.directed ? "yes" : "no",
              t.source_node_type_id,
              t.target_node_type_id,
            ]),
          );
        }
      } catch (err) {
        handleError(err, cmd);
      }
    });

  edgeTypes
    .command("create")
    .description("Create an edge type")
    .requiredOption("--name <name>", "Edge type name")
    .requiredOption("--source-type <id>", "Source node type ID")
    .requiredOption("--target-type <id>", "Target node type ID")
    .option("--directed", "Directed edge (default)")
    .option("--undirected", "Undirected edge")
    .action(async (opts, cmd) => {
      try {
        const graphId = resolveGraphId(cmd);
        const client = getClient();
        const directed = opts.undirected ? false : true;
        const edgeType = await client.createEdgeType(graphId, {
          name: opts.name,
          source_node_type_id: opts.sourceType,
          target_node_type_id: opts.targetType,
          directed,
        });
        if (isJsonMode(cmd)) {
          printJson(edgeType);
        } else {
          printEntityTable(edgeType, [
            "id",
            "name",
            "slug",
            "directed",
            "source_node_type_id",
            "target_node_type_id",
            "created_at",
          ]);
        }
      } catch (err) {
        handleError(err, cmd);
      }
    });

  edgeTypes
    .command("get")
    .description("Get an edge type")
    .argument("<edgeTypeId>", "Edge type ID")
    .action(async (edgeTypeId, _opts, cmd) => {
      try {
        const graphId = resolveGraphId(cmd);
        const client = getClient();
        const edgeType = await client.getEdgeType(graphId, edgeTypeId);
        if (isJsonMode(cmd)) {
          printJson(edgeType);
        } else {
          printEntityTable(edgeType, [
            "id",
            "name",
            "slug",
            "directed",
            "source_node_type_id",
            "target_node_type_id",
            "created_at",
            "updated_at",
          ]);
        }
      } catch (err) {
        handleError(err, cmd);
      }
    });

  edgeTypes
    .command("update")
    .description("Update an edge type")
    .argument("<edgeTypeId>", "Edge type ID")
    .option("--name <name>", "New name")
    .option("--directed", "Set as directed")
    .option("--undirected", "Set as undirected")
    .action(async (edgeTypeId, opts, cmd) => {
      try {
        if (
          !opts.name &&
          opts.directed === undefined &&
          opts.undirected === undefined
        ) {
          throw new Error(
            "Provide at least one of --name, --directed, or --undirected",
          );
        }
        if (opts.directed !== undefined && opts.undirected !== undefined) {
          throw new Error(
            "Cannot pass both --directed and --undirected",
          );
        }
        const graphId = resolveGraphId(cmd);
        const client = getClient();
        const input: Record<string, unknown> = {};
        if (opts.name) input.name = opts.name;
        if (opts.undirected !== undefined) {
          input.directed = false;
        } else if (opts.directed !== undefined) {
          input.directed = true;
        }
        const edgeType = await client.updateEdgeType(
          graphId,
          edgeTypeId,
          input,
        );
        if (isJsonMode(cmd)) {
          printJson(edgeType);
        } else {
          printEntityTable(edgeType, [
            "id",
            "name",
            "slug",
            "directed",
            "updated_at",
          ]);
        }
      } catch (err) {
        handleError(err, cmd);
      }
    });

  edgeTypes
    .command("delete")
    .description("Delete an edge type")
    .argument("<edgeTypeId>", "Edge type ID")
    .action(async (edgeTypeId, _opts, cmd) => {
      try {
        const graphId = resolveGraphId(cmd);
        const client = getClient();
        await client.deleteEdgeType(graphId, edgeTypeId);
        if (isJsonMode(cmd)) {
          printJson({ deleted: true, id: edgeTypeId });
        } else {
          printSuccess(`Deleted edge type ${edgeTypeId}`);
        }
      } catch (err) {
        handleError(err, cmd);
      }
    });

  registerFieldSubcommands(edgeTypes, "edge type", "type", () => {
    const client = getClient();
    return {
      list: (gid, pid) => client.listEdgeTypeFields(gid, pid),
      create: (gid, pid, input) =>
        client.createEdgeTypeField(gid, pid, input as never),
      update: (gid, pid, fid, input) =>
        client.updateEdgeTypeField(gid, pid, fid, input as never),
      delete: (gid, pid, fid) => client.deleteEdgeTypeField(gid, pid, fid),
    };
  });
}

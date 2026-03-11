import type { Command } from "commander";
import { getClient } from "../lib/client.js";
import { registerFieldSubcommands } from "../lib/field-commands.js";
import { resolveGraphId } from "../lib/graph-context.js";
import {
  handleError,
  isJsonMode,
  isQuietMode,
  printJson,
  printQuietId,
  printTable,
  printEntityTable,
  printSuccess,
} from "../lib/output.js";

export function registerNodeTypeCommands(program: Command) {
  const nodeTypes = program
    .command("node-types")
    .description("Manage node types");

  nodeTypes
    .command("list")
    .description("List node types")
    .action(async (_opts, cmd) => {
      try {
        const graphId = resolveGraphId(cmd);
        const client = getClient();
        const types = await client.listNodeTypes(graphId);
        if (isJsonMode(cmd)) {
          printJson(types);
        } else {
          printTable(
            ["ID", "Name", "Slug", "Color", "Icon", "Display Field"],
            types.map((t) => [
              t.id,
              t.name,
              t.slug,
              t.color ?? "",
              t.icon ?? "",
              t.display_field_slug ?? "",
            ]),
          );
        }
      } catch (err) {
        handleError(err, cmd);
      }
    });

  nodeTypes
    .command("create")
    .description("Create a node type")
    .requiredOption("--name <name>", "Node type name")
    .option("--color <hex>", "Color (hex, e.g. #ff0000)")
    .option("--icon <name>", "Lucide icon name")
    .action(async (opts, cmd) => {
      try {
        const graphId = resolveGraphId(cmd);
        const client = getClient();
        const input: { name: string; color?: string; icon?: string } = {
          name: opts.name,
        };
        if (opts.color) input.color = opts.color;
        if (opts.icon) input.icon = opts.icon;
        const nodeType = await client.createNodeType(graphId, input);
        if (isQuietMode(cmd)) {
          printQuietId(nodeType.id);
        } else if (isJsonMode(cmd)) {
          printJson(nodeType);
        } else {
          printEntityTable(nodeType, [
            "id",
            "name",
            "slug",
            "color",
            "icon",
            "created_at",
          ]);
        }
      } catch (err) {
        handleError(err, cmd);
      }
    });

  nodeTypes
    .command("get")
    .description("Get a node type")
    .argument("<nodeTypeId>", "Node type ID")
    .action(async (nodeTypeId, _opts, cmd) => {
      try {
        const graphId = resolveGraphId(cmd);
        const client = getClient();
        const nodeType = await client.getNodeType(graphId, nodeTypeId);
        if (isJsonMode(cmd)) {
          printJson(nodeType);
        } else {
          printEntityTable(nodeType, [
            "id",
            "name",
            "slug",
            "color",
            "icon",
            "display_field_slug",
            "created_at",
            "updated_at",
          ]);
        }
      } catch (err) {
        handleError(err, cmd);
      }
    });

  nodeTypes
    .command("update")
    .description("Update a node type")
    .argument("<nodeTypeId>", "Node type ID")
    .option("--name <name>", "New name")
    .option("--color <hex>", "New color")
    .option("--icon <name>", "New icon")
    .option("--display-field <fieldSlug>", "Display field slug")
    .action(async (nodeTypeId, opts, cmd) => {
      try {
        if (
          !opts.name &&
          !opts.color &&
          !opts.icon &&
          !opts.displayField
        ) {
          throw new Error(
            "Provide at least one of --name, --color, --icon, or --display-field",
          );
        }
        const graphId = resolveGraphId(cmd);
        const client = getClient();
        const input: Record<string, unknown> = {};
        if (opts.name) input.name = opts.name;
        if (opts.color) input.color = opts.color;
        if (opts.icon) input.icon = opts.icon;
        if (opts.displayField) input.display_field_slug = opts.displayField;
        const nodeType = await client.updateNodeType(
          graphId,
          nodeTypeId,
          input,
        );
        if (isQuietMode(cmd)) {
          printQuietId(nodeType.id);
        } else if (isJsonMode(cmd)) {
          printJson(nodeType);
        } else {
          printEntityTable(nodeType, [
            "id",
            "name",
            "slug",
            "color",
            "icon",
            "display_field_slug",
            "updated_at",
          ]);
        }
      } catch (err) {
        handleError(err, cmd);
      }
    });

  nodeTypes
    .command("delete")
    .description("Delete a node type")
    .argument("<nodeTypeId>", "Node type ID")
    .action(async (nodeTypeId, _opts, cmd) => {
      try {
        const graphId = resolveGraphId(cmd);
        const client = getClient();
        await client.deleteNodeType(graphId, nodeTypeId);
        if (isQuietMode(cmd)) {
          printQuietId(nodeTypeId);
        } else if (isJsonMode(cmd)) {
          printJson({ deleted: true, id: nodeTypeId });
        } else {
          printSuccess(`Deleted node type ${nodeTypeId}`);
        }
      } catch (err) {
        handleError(err, cmd);
      }
    });

  registerFieldSubcommands(nodeTypes, "node type", "type", () => {
    const client = getClient();
    return {
      list: (gid, pid) => client.listNodeTypeFields(gid, pid),
      create: (gid, pid, input) =>
        client.createNodeTypeField(gid, pid, input as never),
      update: (gid, pid, fid, input) =>
        client.updateNodeTypeField(gid, pid, fid, input as never),
      delete: (gid, pid, fid) => client.deleteNodeTypeField(gid, pid, fid),
    };
  });
}

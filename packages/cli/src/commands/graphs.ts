import type { Command } from "commander";
import { getClient } from "../lib/client.js";
import { readConfig, writeConfig } from "../lib/config.js";
import {
  handleError,
  isJsonMode,
  printJson,
  printTable,
  printEntityTable,
  printPagination,
  printSuccess,
  truncate,
  formatDate,
} from "../lib/output.js";

export function registerGraphCommands(program: Command) {
  const graphs = program.command("graphs").description("Manage graphs");

  graphs
    .command("list")
    .description("List all graphs")
    .option("--limit <n>", "Max results per page", "50")
    .option("--offset <n>", "Results offset", "0")
    .action(async (opts, cmd) => {
      try {
        const client = getClient();
        const result = await client.listGraphs({
          limit: parseInt(opts.limit),
          offset: parseInt(opts.offset),
        });
        if (isJsonMode(cmd)) {
          printJson(result);
        } else {
          printTable(
            ["ID", "Name", "Description", "Created"],
            result.data.map((g) => [
              g.id,
              g.name,
              truncate(g.description ?? ""),
              formatDate(g.created_at),
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

  graphs
    .command("create")
    .description("Create a new graph")
    .requiredOption("--name <name>", "Graph name")
    .option("--description <desc>", "Graph description")
    .action(async (opts, cmd) => {
      try {
        const client = getClient();
        const graph = await client.createGraph({
          name: opts.name,
          description: opts.description,
        });
        if (isJsonMode(cmd)) {
          printJson(graph);
        } else {
          printEntityTable(graph, [
            "id",
            "name",
            "description",
            "created_at",
          ]);
        }
      } catch (err) {
        handleError(err, cmd);
      }
    });

  graphs
    .command("get")
    .description("Get a graph by ID")
    .argument("<graphId>", "Graph ID")
    .action(async (graphId, _opts, cmd) => {
      try {
        const client = getClient();
        const graph = await client.getGraph(graphId);
        if (isJsonMode(cmd)) {
          printJson(graph);
        } else {
          printEntityTable(graph, [
            "id",
            "name",
            "description",
            "created_by",
            "created_at",
            "updated_at",
          ]);
        }
      } catch (err) {
        handleError(err, cmd);
      }
    });

  graphs
    .command("update")
    .description("Update a graph")
    .argument("<graphId>", "Graph ID")
    .option("--name <name>", "New name")
    .option("--description <desc>", "New description")
    .action(async (graphId, opts, cmd) => {
      try {
        if (!opts.name && !opts.description) {
          throw new Error("Provide at least one of --name or --description");
        }
        const client = getClient();
        const input: { name?: string; description?: string } = {};
        if (opts.name) input.name = opts.name;
        if (opts.description) input.description = opts.description;
        const graph = await client.updateGraph(graphId, input);
        if (isJsonMode(cmd)) {
          printJson(graph);
        } else {
          printEntityTable(graph, [
            "id",
            "name",
            "description",
            "updated_at",
          ]);
        }
      } catch (err) {
        handleError(err, cmd);
      }
    });

  graphs
    .command("delete")
    .description("Delete a graph")
    .argument("<graphId>", "Graph ID")
    .action(async (graphId, _opts, cmd) => {
      try {
        const client = getClient();
        await client.deleteGraph(graphId);
        if (isJsonMode(cmd)) {
          printJson({ deleted: true, id: graphId });
        } else {
          printSuccess(`Deleted graph ${graphId}`);
        }
      } catch (err) {
        handleError(err, cmd);
      }
    });

  graphs
    .command("use")
    .description("Set the active graph context")
    .argument("<graphId>", "Graph ID")
    .action(async (graphId, _opts, cmd) => {
      try {
        const client = getClient();
        const graph = await client.getGraph(graphId);
        const config = readConfig();
        config.active_graph_id = graph.id;
        writeConfig(config);
        if (isJsonMode(cmd)) {
          printJson({ active_graph_id: graph.id, name: graph.name });
        } else {
          printSuccess(`Now using graph: ${graph.name} (${graph.id})`);
        }
      } catch (err) {
        handleError(err, cmd);
      }
    });

  graphs
    .command("current")
    .description("Show the currently active graph")
    .action(async (_opts, cmd) => {
      try {
        const config = readConfig();
        if (!config.active_graph_id) {
          if (isJsonMode(cmd)) {
            printJson({ active_graph_id: null });
          } else {
            console.log(
              "No active graph. Use 'lattice graphs use <id>' to set one.",
            );
          }
          return;
        }
        const client = getClient();
        try {
          const graph = await client.getGraph(config.active_graph_id);
          if (isJsonMode(cmd)) {
            printJson({ active_graph_id: graph.id, name: graph.name });
          } else {
            console.log(`${graph.name} (${graph.id})`);
          }
        } catch {
          if (isJsonMode(cmd)) {
            printJson({
              active_graph_id: config.active_graph_id,
              error: "Graph not found — it may have been deleted",
            });
          } else {
            console.log(
              `Active graph ${config.active_graph_id} not found — it may have been deleted. Run 'lattice graphs use <id>' to set a new one.`,
            );
          }
        }
      } catch (err) {
        handleError(err, cmd);
      }
    });

  graphs
    .command("unuse")
    .description("Clear the active graph context")
    .action(async (_opts, cmd) => {
      try {
        const config = readConfig();
        delete config.active_graph_id;
        writeConfig(config);
        if (isJsonMode(cmd)) {
          printJson({ active_graph_id: null });
        } else {
          printSuccess("Active graph cleared.");
        }
      } catch (err) {
        handleError(err, cmd);
      }
    });
}

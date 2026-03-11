import type { Command } from "commander";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { getClient } from "../lib/client.js";
import { resolveGraphId } from "../lib/graph-context.js";
import {
  handleError,
  isJsonMode,
  printJson,
  printTable,
  printSuccess,
} from "../lib/output.js";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

function readCsvFile(filePath: string): File {
  const absPath = resolve(filePath);
  let stat;
  try {
    stat = statSync(absPath);
  } catch {
    throw new Error(`File not found: ${absPath}`);
  }
  if (stat.size > MAX_FILE_SIZE) {
    throw new Error(
      `File is ${(stat.size / 1024 / 1024).toFixed(1)} MB — exceeds the 5 MB limit`,
    );
  }
  const content = readFileSync(absPath);
  return new File([content], absPath.split("/").pop()!, {
    type: "text/csv",
  });
}

export function registerImportCommands(program: Command) {
  const imp = program.command("import").description("Import data from CSV");

  imp
    .command("nodes")
    .description("Import nodes from CSV file")
    .requiredOption("--type <id>", "Node type ID")
    .requiredOption("--file <path>", "Path to CSV file")
    .action(async (opts, cmd) => {
      try {
        const graphId = resolveGraphId(cmd);
        const client = getClient();
        const file = readCsvFile(opts.file);
        const result = await client.importNodes(graphId, opts.type, file);
        if (isJsonMode(cmd)) {
          printJson(result);
        } else {
          printSuccess(`Imported ${result.count} nodes`);
        }
      } catch (err) {
        if (isImportValidationError(err)) {
          if (isJsonMode(cmd)) {
            printJson(err);
          } else {
            displayImportErrors(err);
          }
          process.exit(1);
        }
        handleError(err, cmd);
      }
    });

  imp
    .command("edges")
    .description("Import edges from CSV file")
    .requiredOption("--type <id>", "Edge type ID")
    .requiredOption("--file <path>", "Path to CSV file")
    .action(async (opts, cmd) => {
      try {
        const graphId = resolveGraphId(cmd);
        const client = getClient();
        const file = readCsvFile(opts.file);
        const result = await client.importEdges(graphId, opts.type, file);
        if (isJsonMode(cmd)) {
          printJson(result);
        } else {
          printSuccess(`Imported ${result.count} edges`);
        }
      } catch (err) {
        if (isImportValidationError(err)) {
          if (isJsonMode(cmd)) {
            printJson(err);
          } else {
            displayImportErrors(err);
          }
          process.exit(1);
        }
        handleError(err, cmd);
      }
    });
}

interface ImportError {
  status: number;
  errors?: Array<{ row?: number; field?: string; message: string }>;
}

function isImportValidationError(err: unknown): err is ImportError {
  return (
    typeof err === "object" &&
    err !== null &&
    "errors" in err &&
    Array.isArray((err as ImportError).errors)
  );
}

function displayImportErrors(err: ImportError) {
  console.error("Import failed with validation errors:\n");
  printTable(
    ["Row", "Field", "Error"],
    (err.errors ?? []).map((e) => [
      e.row !== undefined ? String(e.row) : "",
      e.field ?? "",
      e.message,
    ]),
  );
}

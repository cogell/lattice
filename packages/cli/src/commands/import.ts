import type { Command } from "commander";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { ApiError, parseCsv, unparseCsv, type PaginatedResult, type Node } from "@lattice/shared";
import { getClient } from "../lib/client.js";
import { resolveGraphId } from "../lib/graph-context.js";
import {
  handleError,
  isJsonMode,
  isQuietMode,
  printJson,
  printQuietId,
  printTable,
  printSuccess,
} from "../lib/output.js";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

function readCsvContent(filePath: string): string {
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
  return readFileSync(absPath, "utf-8");
}

function csvContentToFile(content: string, filePath: string): File {
  return new File([content], resolve(filePath).split("/").pop()!, {
    type: "text/csv",
  });
}

function readCsvFile(filePath: string): File {
  return csvContentToFile(readCsvContent(filePath), filePath);
}

/** Fetch all nodes of a given type, paginating through all results. */
async function fetchAllNodes(
  client: ReturnType<typeof getClient>,
  graphId: string,
  nodeTypeId: string,
): Promise<Node[]> {
  const all: Node[] = [];
  const limit = 100;
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const page: PaginatedResult<Node> = await client.listNodes(graphId, nodeTypeId, { limit, offset });
    all.push(...page.data);
    hasMore = page.pagination.has_more;
    offset += limit;
  }
  return all;
}

/**
 * If the CSV uses display-field names instead of source_node_id/target_node_id,
 * resolve them to IDs and rewrite the CSV. Returns the (possibly rewritten) CSV content.
 *
 * @internal Exported for testing.
 */
export async function resolveEdgeDisplayNames(
  csvContent: string,
  edgeTypeId: string,
  graphId: string,
  client: ReturnType<typeof getClient>,
): Promise<string> {
  const { headers, rows } = parseCsv(csvContent);

  // If both ID columns are present, no resolution needed
  if (headers.includes("source_node_id") && headers.includes("target_node_id")) {
    return csvContent;
  }

  // Look up the edge type to get source/target node type IDs
  const edgeType = await client.getEdgeType(graphId, edgeTypeId);
  const sourceNodeTypeId = edgeType.source_node_type_id;
  const targetNodeTypeId = edgeType.target_node_type_id;

  // Look up both node types to get their names and display_field_slug
  const [sourceNodeType, targetNodeType] = await Promise.all([
    client.getNodeType(graphId, sourceNodeTypeId),
    client.getNodeType(graphId, targetNodeTypeId),
  ]);

  // Find which CSV columns match the node type names.
  // Support both exact matches ("Character") and prefixed matches ("Source Character", "Target Character").
  // Prefixed form is required when source and target are the same node type.
  const isSameType = sourceNodeTypeId === targetNodeTypeId;

  const sourcePrefixedColName = headers.find(
    (h) => h.toLowerCase() === `source ${sourceNodeType.name.toLowerCase()}`,
  );
  const targetPrefixedColName = headers.find(
    (h) => h.toLowerCase() === `target ${targetNodeType.name.toLowerCase()}`,
  );
  const sourceExactColName = headers.find(
    (h) => h.toLowerCase() === sourceNodeType.name.toLowerCase(),
  );
  const targetExactColName = headers.find(
    (h) => h.toLowerCase() === targetNodeType.name.toLowerCase(),
  );

  // Detect ambiguity: both exact and prefixed for the same side
  if (sourcePrefixedColName && sourceExactColName) {
    throw new Error(
      `Ambiguous columns: both "${sourceExactColName}" and "${sourcePrefixedColName}" found. Use one or the other.`,
    );
  }
  if (targetPrefixedColName && targetExactColName && targetExactColName !== sourceExactColName) {
    throw new Error(
      `Ambiguous columns: both "${targetExactColName}" and "${targetPrefixedColName}" found. Use one or the other.`,
    );
  }

  let sourceColName: string | undefined;
  let targetColName: string | undefined;

  if (isSameType) {
    // Same-type edges: exact match is ambiguous (both sides match the same column)
    if (sourceExactColName && !sourcePrefixedColName && !targetPrefixedColName) {
      throw new Error(
        `Edge type has the same source and target node type "${sourceNodeType.name}". ` +
        `Use "Source ${sourceNodeType.name}" and "Target ${sourceNodeType.name}" column headers to distinguish direction.`,
      );
    }
    sourceColName = sourcePrefixedColName;
    targetColName = targetPrefixedColName;
  } else {
    // Different-type edges: prefixed takes precedence, fall back to exact
    sourceColName = sourcePrefixedColName || sourceExactColName;
    targetColName = targetPrefixedColName || targetExactColName;
  }

  if (!sourceColName && !headers.includes("source_node_id")) {
    const hint = isSameType
      ? `"Source ${sourceNodeType.name}"`
      : `"${sourceNodeType.name}" or "Source ${sourceNodeType.name}"`;
    throw new Error(
      `CSV must have either a "source_node_id" column or a ${hint} column to identify source nodes`,
    );
  }
  if (!targetColName && !headers.includes("target_node_id")) {
    const hint = isSameType
      ? `"Target ${targetNodeType.name}"`
      : `"${targetNodeType.name}" or "Target ${targetNodeType.name}"`;
    throw new Error(
      `CSV must have either a "target_node_id" column or a ${hint} column to identify target nodes`,
    );
  }

  // If both are already ID columns, nothing to resolve
  if (!sourceColName && !targetColName) {
    return csvContent;
  }

  // Determine which display field slug to use for lookup
  const sourceDisplaySlug = sourceNodeType.display_field_slug;
  const targetDisplaySlug = targetNodeType.display_field_slug;

  if (sourceColName && !sourceDisplaySlug) {
    throw new Error(
      `Node type "${sourceNodeType.name}" has no display field configured. Set a display field or use source_node_id with raw IDs.`,
    );
  }
  if (targetColName && !targetDisplaySlug) {
    throw new Error(
      `Node type "${targetNodeType.name}" has no display field configured. Set a display field or use target_node_id with raw IDs.`,
    );
  }

  // Build display-value → node-ID maps by fetching all nodes of each type
  const buildLookup = async (
    nodeTypeId: string,
    displaySlug: string,
  ): Promise<Map<string, string>> => {
    const nodes = await fetchAllNodes(client, graphId, nodeTypeId);
    const map = new Map<string, string>();
    for (const node of nodes) {
      const displayValue = node.data[displaySlug];
      if (displayValue !== null && displayValue !== undefined) {
        const key = String(displayValue);
        if (map.has(key)) {
          throw new Error(
            `Duplicate display value "${key}" found for node type. Display field values must be unique when using name-based resolution.`,
          );
        }
        map.set(key, node.id);
      }
    }
    return map;
  };

  // For same-type edges, reuse a single lookup for both sides to avoid fetching twice
  const needsSourceLookup = !!sourceColName;
  const needsTargetLookup = !!targetColName;
  let sourceLookup = new Map<string, string>();
  let targetLookup = new Map<string, string>();

  if (isSameType && needsSourceLookup && needsTargetLookup) {
    const sharedLookup = await buildLookup(sourceNodeTypeId, sourceDisplaySlug!);
    sourceLookup = sharedLookup;
    targetLookup = sharedLookup;
  } else {
    [sourceLookup, targetLookup] = await Promise.all([
      needsSourceLookup ? buildLookup(sourceNodeTypeId, sourceDisplaySlug!) : Promise.resolve(new Map<string, string>()),
      needsTargetLookup ? buildLookup(targetNodeTypeId, targetDisplaySlug!) : Promise.resolve(new Map<string, string>()),
    ]);
  }

  // Rewrite rows: replace display-name columns with source_node_id / target_node_id
  const errors: string[] = [];
  const rewrittenRows = rows.map((row, i) => {
    const newRow: Record<string, string> = {};

    // Copy all columns except the ones we're replacing
    for (const [key, value] of Object.entries(row)) {
      if (key === sourceColName || key === targetColName) continue;
      newRow[key] = value;
    }

    // Resolve source
    if (sourceColName) {
      const displayValue = row[sourceColName];
      if (!displayValue) {
        errors.push(`Row ${i + 1}: empty value in "${sourceColName}" column`);
      } else {
        const nodeId = sourceLookup.get(displayValue);
        if (!nodeId) {
          errors.push(
            `Row ${i + 1}: no ${sourceNodeType.name} node found with ${sourceDisplaySlug} = "${displayValue}"`,
          );
        } else {
          newRow["source_node_id"] = nodeId;
        }
      }
    } else {
      newRow["source_node_id"] = row["source_node_id"] ?? "";
    }

    // Resolve target
    if (targetColName) {
      const displayValue = row[targetColName];
      if (!displayValue) {
        errors.push(`Row ${i + 1}: empty value in "${targetColName}" column`);
      } else {
        const nodeId = targetLookup.get(displayValue);
        if (!nodeId) {
          errors.push(
            `Row ${i + 1}: no ${targetNodeType.name} node found with ${targetDisplaySlug} = "${displayValue}"`,
          );
        } else {
          newRow["target_node_id"] = nodeId;
        }
      }
    } else {
      newRow["target_node_id"] = row["target_node_id"] ?? "";
    }

    return newRow;
  });

  if (errors.length > 0) {
    throw new Error(
      `Failed to resolve display names to node IDs:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
    );
  }

  // Build new headers: replace display-name columns with ID columns
  const newHeaders = headers
    .map((h) => {
      if (h === sourceColName) return "source_node_id";
      if (h === targetColName) return "target_node_id";
      return h;
    });

  // Ensure both ID columns are present in headers
  if (!newHeaders.includes("source_node_id")) {
    newHeaders.unshift("source_node_id");
  }
  if (!newHeaders.includes("target_node_id")) {
    const srcIdx = newHeaders.indexOf("source_node_id");
    newHeaders.splice(srcIdx + 1, 0, "target_node_id");
  }

  return unparseCsv(newHeaders, rewrittenRows);
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
        if (isQuietMode(cmd)) {
          printQuietId(String(result.imported));
        } else if (isJsonMode(cmd)) {
          printJson(result);
        } else {
          printSuccess(`Imported ${result.imported} nodes`);
        }
      } catch (err) {
        if (isImportValidationError(err)) {
          if (isJsonMode(cmd)) {
            printJson({ error: { status: err.status, message: err.message, details: err.details } });
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
        const csvContent = readCsvContent(opts.file);
        const resolvedCsv = await resolveEdgeDisplayNames(
          csvContent,
          opts.type,
          graphId,
          client,
        );
        const file = csvContentToFile(resolvedCsv, opts.file);
        const result = await client.importEdges(graphId, opts.type, file);
        if (isQuietMode(cmd)) {
          printQuietId(String(result.imported));
        } else if (isJsonMode(cmd)) {
          printJson(result);
        } else {
          printSuccess(`Imported ${result.imported} edges`);
        }
      } catch (err) {
        if (isImportValidationError(err)) {
          if (isJsonMode(cmd)) {
            printJson({ error: { status: err.status, message: err.message, details: err.details } });
          } else {
            displayImportErrors(err);
          }
          process.exit(1);
        }
        handleError(err, cmd);
      }
    });
}

function isImportValidationError(err: unknown): err is ApiError & { details: Array<{ row: number; field: string; message: string }> } {
  return (
    err instanceof ApiError &&
    Array.isArray(err.details) &&
    err.details.length > 0
  );
}

function displayImportErrors(err: ApiError & { details: Array<{ row: number; field: string; message: string }> }) {
  console.error("Import failed with validation errors:\n");
  printTable(
    ["Row", "Field", "Error"],
    err.details.map((e) => [
      String(e.row),
      e.field,
      e.message,
    ]),
  );
}

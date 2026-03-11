import type { Command } from "commander";
import { FIELD_TYPES } from "@lattice/shared";
import { resolveGraphId } from "./graph-context.js";
import {
  handleError,
  isJsonMode,
  isQuietMode,
  printJson,
  printQuietId,
  printTable,
  printEntityTable,
  printSuccess,
} from "./output.js";

interface FieldApi {
  list(graphId: string, parentId: string): Promise<unknown[]>;
  create(
    graphId: string,
    parentId: string,
    input: Record<string, unknown>,
  ): Promise<unknown>;
  update(
    graphId: string,
    parentId: string,
    fieldId: string,
    input: Record<string, unknown>,
  ): Promise<unknown>;
  delete(graphId: string, parentId: string, fieldId: string): Promise<void>;
}

export function registerFieldSubcommands(
  parent: Command,
  resourceLabel: string,
  typeFlag: string,
  getApi: () => FieldApi,
) {
  const fields = parent.command("fields").description(`Manage ${resourceLabel} fields`);

  fields
    .command("list")
    .description(`List fields on a ${resourceLabel}`)
    .requiredOption(`--type <id>`, `${resourceLabel} ID`)
    .action(async (opts, cmd) => {
      try {
        const graphId = resolveGraphId(cmd);
        const api = getApi();
        const result = await api.list(graphId, opts.type);
        if (isJsonMode(cmd)) {
          printJson(result);
        } else {
          const rows = (result as Record<string, unknown>[]).map((f) => [
            String(f.id),
            String(f.name),
            String(f.slug),
            String(f.field_type),
            String(f.ordinal),
            f.required ? "yes" : "no",
            formatOptions(f.config as Record<string, unknown>),
          ]);
          printTable(
            ["ID", "Name", "Slug", "Type", "Ordinal", "Required", "Options"],
            rows,
          );
        }
      } catch (err) {
        handleError(err, cmd);
      }
    });

  fields
    .command("create")
    .description(`Create a field on a ${resourceLabel}`)
    .requiredOption(`--type <id>`, `${resourceLabel} ID`)
    .requiredOption("--name <name>", "Field name")
    .requiredOption("--field-type <type>", `Field type (${FIELD_TYPES.join(", ")})`)
    .option("--ordinal <n>", "Display order", "0")
    .option("--required", "Mark as required")
    .option("--options <opts>", "Comma-separated options (for select/multi_select)")
    .action(async (opts, cmd) => {
      try {
        if (!FIELD_TYPES.includes(opts.fieldType)) {
          throw new Error(
            `Invalid field type '${opts.fieldType}'. Must be one of: ${FIELD_TYPES.join(", ")}`,
          );
        }
        if (
          opts.options &&
          opts.fieldType !== "select" &&
          opts.fieldType !== "multi_select"
        ) {
          throw new Error("--options is only valid for select or multi_select field types");
        }
        const graphId = resolveGraphId(cmd);
        const api = getApi();
        const input: Record<string, unknown> = {
          name: opts.name,
          field_type: opts.fieldType,
          ordinal: parseInt(opts.ordinal),
          required: opts.required ?? false,
        };
        if (opts.options) {
          input.config = {
            options: opts.options.split(",").map((o: string) => o.trim()),
          };
        }
        const field = await api.create(graphId, opts.type, input);
        if (isQuietMode(cmd)) {
          printQuietId(String((field as Record<string, unknown>).id));
        } else if (isJsonMode(cmd)) {
          printJson(field);
        } else {
          const f = field as Record<string, unknown>;
          printEntityTable(f, [
            "id",
            "name",
            "slug",
            "field_type",
            "ordinal",
            "required",
            "created_at",
          ]);
        }
      } catch (err) {
        handleError(err, cmd);
      }
    });

  fields
    .command("update")
    .description(`Update a field on a ${resourceLabel}`)
    .argument("<fieldId>", "Field ID")
    .requiredOption(`--type <id>`, `${resourceLabel} ID`)
    .option("--name <name>", "New name")
    .option("--ordinal <n>", "New ordinal")
    .option("--required", "Mark as required")
    .option("--no-required", "Mark as not required")
    .option("--options <opts>", "Comma-separated options (replaces existing)")
    .action(async (fieldId, opts, cmd) => {
      try {
        const hasChanges =
          opts.name ||
          opts.ordinal !== undefined ||
          opts.options;
        // --required and --no-required are handled by Commander as a boolean
        if (!hasChanges && opts.required === undefined) {
          throw new Error(
            "Provide at least one of --name, --ordinal, --required/--no-required, or --options",
          );
        }
        const graphId = resolveGraphId(cmd);
        const api = getApi();
        const input: Record<string, unknown> = {};
        if (opts.name) input.name = opts.name;
        if (opts.ordinal !== undefined) input.ordinal = parseInt(opts.ordinal);
        if (opts.required !== undefined) input.required = opts.required;
        if (opts.options) {
          input.config = {
            options: opts.options.split(",").map((o: string) => o.trim()),
          };
        }
        const field = await api.update(graphId, opts.type, fieldId, input);
        if (isQuietMode(cmd)) {
          printQuietId(fieldId);
        } else if (isJsonMode(cmd)) {
          printJson(field);
        } else {
          const f = field as Record<string, unknown>;
          printEntityTable(f, [
            "id",
            "name",
            "slug",
            "field_type",
            "ordinal",
            "required",
            "updated_at",
          ]);
        }
      } catch (err) {
        handleError(err, cmd);
      }
    });

  fields
    .command("delete")
    .description(`Delete a field from a ${resourceLabel}`)
    .argument("<fieldId>", "Field ID")
    .requiredOption(`--type <id>`, `${resourceLabel} ID`)
    .action(async (fieldId, opts, cmd) => {
      try {
        const graphId = resolveGraphId(cmd);
        const api = getApi();
        await api.delete(graphId, opts.type, fieldId);
        if (isQuietMode(cmd)) {
          printQuietId(fieldId);
        } else if (isJsonMode(cmd)) {
          printJson({ deleted: true, id: fieldId });
        } else {
          printSuccess(`Deleted field ${fieldId}`);
        }
      } catch (err) {
        handleError(err, cmd);
      }
    });
}

function formatOptions(config: Record<string, unknown>): string {
  if (!config || !config.options) return "";
  const opts = config.options as string[];
  return opts.join(", ");
}

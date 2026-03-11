import Table from "cli-table3";
import chalk from "chalk";
import type { Command } from "commander";

export function isJsonMode(cmd: Command): boolean {
  return cmd.optsWithGlobals().json === true;
}

export function isQuietMode(cmd: Command): boolean {
  return cmd.optsWithGlobals().quiet === true;
}

/**
 * Print just a resource ID (for --quiet mode scripting).
 * Writes to stdout with a trailing newline.
 */
export function printQuietId(id: string): void {
  process.stdout.write(id + "\n");
}

export function printJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}

export function printTable(headers: string[], rows: string[][]): void {
  const table = new Table({ head: headers.map((h) => chalk.bold(h)) });
  for (const row of rows) {
    table.push(row);
  }
  console.log(table.toString());
}

export function printEntityTable(
  entity: Record<string, unknown>,
  fields: string[],
): void {
  const table = new Table();
  for (const field of fields) {
    const value = entity[field];
    const displayValue =
      value === null || value === undefined ? "" : String(value);
    table.push({ [chalk.bold(field)]: displayValue });
  }
  console.log(table.toString());
}

export function printPagination(
  offset: number,
  limit: number,
  total: number,
): void {
  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);
  console.log(
    chalk.dim(`Page ${page} of ${totalPages} (${total} total)`),
  );
}

export function printSuccess(message: string): void {
  console.log(chalk.green(message));
}

export function printError(err: unknown): void {
  if (err instanceof Error && "status" in err) {
    const apiErr = err as Error & { status: number };
    console.error(
      chalk.red(`Error ${apiErr.status}: ${apiErr.message}`),
    );
  } else if (err instanceof Error) {
    console.error(chalk.red(`Error: ${err.message}`));
  } else {
    console.error(chalk.red(`Error: ${String(err)}`));
  }
}

export function printErrorJson(err: unknown): void {
  if (err instanceof Error && "status" in err) {
    const apiErr = err as Error & { status: number };
    printJson({ error: { status: apiErr.status, message: apiErr.message } });
  } else if (err instanceof Error) {
    printJson({ error: { message: err.message } });
  } else {
    printJson({ error: { message: String(err) } });
  }
}

export function handleError(err: unknown, cmd: Command): void {
  if (isJsonMode(cmd)) {
    printErrorJson(err);
  } else {
    printError(err);
  }
  process.exit(1);
}

export function truncate(str: string, maxLen: number = 40): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "…";
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toISOString().split("T")[0];
}

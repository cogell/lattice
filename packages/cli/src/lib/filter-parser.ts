import { FILTER_OPERATORS } from "@lattice/shared";

export interface ParsedFilter {
  field: string;
  op: string;
  value: string;
}

const VALID_OPS = new Set<string>(FILTER_OPERATORS);

/**
 * Parse a filter string like 'field_slug[eq]=value' into components.
 * Handles values with special characters including '=' and brackets.
 */
export function parseFilter(filterStr: string): ParsedFilter {
  const bracketOpen = filterStr.indexOf("[");
  const bracketClose = filterStr.indexOf("]", bracketOpen);
  const eqSign = filterStr.indexOf("=", bracketClose);

  if (bracketOpen === -1 || bracketClose === -1 || eqSign === -1) {
    throw new Error(
      `Invalid filter format: '${filterStr}'. Expected: 'field_slug[op]=value' (e.g., 'name[eq]=Alice')`,
    );
  }

  const field = filterStr.slice(0, bracketOpen);
  const op = filterStr.slice(bracketOpen + 1, bracketClose);
  const value = filterStr.slice(eqSign + 1);

  if (!field) {
    throw new Error(`Invalid filter: missing field name in '${filterStr}'`);
  }

  if (!VALID_OPS.has(op)) {
    throw new Error(
      `Invalid filter operator '${op}'. Must be one of: ${[...VALID_OPS].join(", ")}`,
    );
  }

  return { field, op, value };
}

/**
 * Convert parsed filters into the API's ListOptions.filters format.
 */
export function filtersToApiFormat(
  filters: ParsedFilter[],
): Record<string, Partial<Record<string, string>>> {
  const result: Record<string, Partial<Record<string, string>>> = {};
  for (const f of filters) {
    if (!result[f.field]) result[f.field] = {};
    result[f.field][f.op] = f.value;
  }
  return result;
}

/**
 * Parse a sort string like 'field_slug:asc' into components.
 */
export function parseSort(sortStr: string): { field: string; direction: string } {
  const parts = sortStr.split(":");
  if (parts.length !== 2 || !["asc", "desc"].includes(parts[1])) {
    throw new Error(
      `Invalid sort format: '${sortStr}'. Expected: 'field_slug:asc' or 'field_slug:desc'`,
    );
  }
  return { field: parts[0], direction: parts[1] };
}

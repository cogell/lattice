import type { FilterParam } from "@lattice/shared";

/** Coerce a string value to the appropriate JS type for SQL binding. */
function coerceValue(value: string, fieldType: string): unknown {
  switch (fieldType) {
    case "number":
      return Number(value);
    case "boolean":
      return value === "true";
    default:
      return value;
  }
}

/**
 * Build SQL WHERE clause fragments and bind values from filter params.
 * Each filter generates a condition using json_extract on the `data` column.
 */
export function buildFilterClauses(filters: FilterParam[]): {
  clauses: string[];
  values: unknown[];
} {
  const clauses: string[] = [];
  const values: unknown[] = [];

  for (const f of filters) {
    const jsonPath = `json_extract(data, '$."${f.field}"')`;

    switch (f.operator) {
      case "eq":
        clauses.push(`${jsonPath} = ?`);
        values.push(coerceValue(f.value, f.fieldType));
        break;
      case "contains":
        clauses.push(`${jsonPath} LIKE ?`);
        values.push(`%${f.value}%`);
        break;
      case "is_null":
        clauses.push(`(${jsonPath} IS NULL)`);
        break;
    }
  }

  return { clauses, values };
}

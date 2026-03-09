import { z } from "zod";
import type { FieldType } from "./field-types.js";

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

export const paginationMetaSchema = z.object({
  total: z.number().int().min(0),
  limit: z.number().int().min(1),
  offset: z.number().int().min(0),
  has_more: z.boolean(),
});

export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

/** Wrap any item schema in the paginated envelope. */
export function paginatedResponseSchema<S extends z.ZodTypeAny>(itemSchema: S) {
  return z.object({
    data: z.array(itemSchema),
    pagination: paginationMetaSchema,
  });
}

// ---------------------------------------------------------------------------
// Query param parsing — pagination
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MIN_LIMIT = 1;

export interface PaginationParams {
  limit: number;
  offset: number;
}

/**
 * Extract `limit` and `offset` from URLSearchParams.
 * Returns validated values with defaults. Throws on invalid input.
 */
export function parsePaginationParams(query: URLSearchParams): PaginationParams {
  const rawLimit = query.get("limit");
  const rawOffset = query.get("offset");

  let limit = DEFAULT_LIMIT;
  if (rawLimit !== null) {
    limit = Number(rawLimit);
    if (!Number.isInteger(limit) || limit < MIN_LIMIT || limit > MAX_LIMIT) {
      throw new PaginationError(
        `limit must be an integer between ${MIN_LIMIT} and ${MAX_LIMIT}`,
      );
    }
  }

  let offset = 0;
  if (rawOffset !== null) {
    offset = Number(rawOffset);
    if (!Number.isInteger(offset) || offset < 0) {
      throw new PaginationError("offset must be a non-negative integer");
    }
  }

  return { limit, offset };
}

// ---------------------------------------------------------------------------
// Query param parsing — sort
// ---------------------------------------------------------------------------

export interface SortParam {
  field: string;
  direction: "asc" | "desc";
}

/**
 * Extract `sort` query param (format: `fieldSlug:asc` or `fieldSlug:desc`).
 * Returns null when no sort param is present.
 * `validSlugs` is the set of allowed field slugs — rejects unknown fields.
 */
export function parseSortParam(
  query: URLSearchParams,
  validSlugs: Set<string>,
): SortParam | null {
  const raw = query.get("sort");
  if (raw === null) return null;

  const parts = raw.split(":");
  if (parts.length !== 2) {
    throw new PaginationError(
      'sort must be in the format "fieldSlug:asc" or "fieldSlug:desc"',
    );
  }

  const [field, dir] = parts;
  if (!field) {
    throw new PaginationError("sort field slug must not be empty");
  }
  if (dir !== "asc" && dir !== "desc") {
    throw new PaginationError('sort direction must be "asc" or "desc"');
  }
  if (!validSlugs.has(field)) {
    throw new PaginationError(`unknown sort field: ${field}`);
  }

  return { field, direction: dir };
}

// ---------------------------------------------------------------------------
// Query param parsing — filters
// ---------------------------------------------------------------------------

export const FILTER_OPERATORS = ["eq", "contains", "is_null"] as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

export interface FilterParam {
  field: string;
  operator: FilterOperator;
  value: string;
  fieldType: FieldType;
}

/**
 * Extract `filter[slug][op]=value` query params.
 * Validates that slugs exist and operators are valid for the field type.
 *
 * `fieldMap` maps slug → FieldType so we can reject `contains` on non-text fields.
 */
export function parseFilterParams(
  query: URLSearchParams,
  fieldMap: Map<string, FieldType>,
): FilterParam[] {
  const filters: FilterParam[] = [];
  const filterRegex = /^filter\[([^\]]+)]\[([^\]]+)]$/;

  for (const [key, value] of query.entries()) {
    const match = filterRegex.exec(key);
    if (!match) continue;

    const slug = match[1];
    const op = match[2];

    if (!fieldMap.has(slug)) {
      throw new PaginationError(`unknown filter field: ${slug}`);
    }

    if (!FILTER_OPERATORS.includes(op as FilterOperator)) {
      throw new PaginationError(
        `invalid filter operator "${op}"; allowed: ${FILTER_OPERATORS.join(", ")}`,
      );
    }

    const operator = op as FilterOperator;
    const fieldType = fieldMap.get(slug)!;

    if (operator === "contains" && fieldType !== "text") {
      throw new PaginationError(
        `"contains" operator is only valid for text fields (field "${slug}" is ${fieldType})`,
      );
    }

    filters.push({ field: slug, operator, value, fieldType });
  }

  return filters;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class PaginationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaginationError";
  }
}

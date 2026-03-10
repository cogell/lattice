import Papa from "papaparse";
import type { FieldDefinition } from "./validate-data.js";

// ---------------------------------------------------------------------------
// Field name ↔ slug mapping
// ---------------------------------------------------------------------------

export function buildSlugToNameMap(
  fields: FieldDefinition[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const f of fields) {
    map.set(f.slug, f.name);
  }
  return map;
}

export function buildNameToSlugMap(
  fields: FieldDefinition[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const f of fields) {
    map.set(f.name, f.slug);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Value coercion (CSV string → typed value for import)
// ---------------------------------------------------------------------------

const MULTI_SELECT_SEPARATOR = "|";

export function coerceValue(
  raw: string,
  fieldType: string,
): unknown {
  if (raw === "") return null;

  switch (fieldType) {
    case "number": {
      const n = Number(raw);
      if (Number.isNaN(n)) return raw; // let validation catch it
      return n;
    }
    case "boolean": {
      const lower = raw.toLowerCase();
      if (lower === "true" || lower === "1") return true;
      if (lower === "false" || lower === "0") return false;
      return raw; // let validation catch it
    }
    case "multi_select":
      return raw.split(MULTI_SELECT_SEPARATOR).map((s) => s.trim());
    default:
      // text, date, url, email, select — keep as string
      return raw;
  }
}

// ---------------------------------------------------------------------------
// Value serialization (typed value → CSV string for export)
// ---------------------------------------------------------------------------

export function serializeValue(value: unknown, fieldType: string): string {
  if (value === null || value === undefined) return "";

  switch (fieldType) {
    case "multi_select":
      return Array.isArray(value)
        ? value.join(MULTI_SELECT_SEPARATOR)
        : String(value);
    case "boolean":
      return String(value);
    case "number":
      return String(value);
    default:
      return String(value);
  }
}

// ---------------------------------------------------------------------------
// CSV parse / unparse (thin wrappers around PapaParse)
// ---------------------------------------------------------------------------

export interface CsvParseResult {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseCsv(csvString: string): CsvParseResult {
  const result = Papa.parse<Record<string, string>>(csvString, {
    header: true,
    skipEmptyLines: true,
  });

  if (result.errors.length > 0) {
    const first = result.errors[0];
    throw new CsvParseError(
      `CSV parse error at row ${(first.row ?? 0) + 1}: ${first.message}`,
    );
  }

  return {
    headers: result.meta.fields ?? [],
    rows: result.data,
  };
}

export function unparseCsv(
  headers: string[],
  rows: Record<string, string>[],
): string {
  return Papa.unparse({ fields: headers, data: rows });
}

// ---------------------------------------------------------------------------
// High-level: serialize nodes to CSV
// ---------------------------------------------------------------------------

export function serializeNodesToCsv(
  nodes: Array<{ id: string; data: Record<string, unknown> }>,
  fields: FieldDefinition[],
): string {
  const slugToName = buildSlugToNameMap(fields);
  const fieldTypeMap = new Map(fields.map((f) => [f.slug, f.field_type]));
  const orderedSlugs = fields
    .slice()
    .sort((a, b) => {
      const aOrd = "ordinal" in a ? (a as unknown as { ordinal: number }).ordinal : 0;
      const bOrd = "ordinal" in b ? (b as unknown as { ordinal: number }).ordinal : 0;
      return aOrd - bOrd;
    })
    .map((f) => f.slug);

  const headers = ["id", ...orderedSlugs.map((s) => slugToName.get(s) ?? s)];

  const rows = nodes.map((node) => {
    const row: Record<string, string> = { id: node.id };
    for (const slug of orderedSlugs) {
      const name = slugToName.get(slug) ?? slug;
      const type = fieldTypeMap.get(slug) ?? "text";
      row[name] = serializeValue(node.data[slug], type);
    }
    return row;
  });

  return unparseCsv(headers, rows);
}

// ---------------------------------------------------------------------------
// High-level: serialize edges to CSV
// ---------------------------------------------------------------------------

export function serializeEdgesToCsv(
  edges: Array<{
    id: string;
    source_node_id: string;
    target_node_id: string;
    data: Record<string, unknown>;
  }>,
  fields: FieldDefinition[],
): string {
  const slugToName = buildSlugToNameMap(fields);
  const fieldTypeMap = new Map(fields.map((f) => [f.slug, f.field_type]));
  const orderedSlugs = fields
    .slice()
    .sort((a, b) => {
      const aOrd = "ordinal" in a ? (a as unknown as { ordinal: number }).ordinal : 0;
      const bOrd = "ordinal" in b ? (b as unknown as { ordinal: number }).ordinal : 0;
      return aOrd - bOrd;
    })
    .map((f) => f.slug);

  const headers = [
    "id",
    "source_node_id",
    "target_node_id",
    ...orderedSlugs.map((s) => slugToName.get(s) ?? s),
  ];

  const rows = edges.map((edge) => {
    const row: Record<string, string> = {
      id: edge.id,
      source_node_id: edge.source_node_id,
      target_node_id: edge.target_node_id,
    };
    for (const slug of orderedSlugs) {
      const name = slugToName.get(slug) ?? slug;
      const type = fieldTypeMap.get(slug) ?? "text";
      row[name] = serializeValue(edge.data[slug], type);
    }
    return row;
  });

  return unparseCsv(headers, rows);
}

// ---------------------------------------------------------------------------
// High-level: parse CSV rows into typed data objects (for import)
// ---------------------------------------------------------------------------

export interface ParsedImportRow {
  data: Record<string, unknown>;
}

export interface ImportParseResult {
  rows: ParsedImportRow[];
  /** Extra columns from CSV that aren't "id" or known field names. */
  unknownHeaders: string[];
}

export function parseNodeImportCsv(
  csvString: string,
  fields: FieldDefinition[],
): ImportParseResult {
  const { headers, rows } = parseCsv(csvString);
  const nameToSlug = buildNameToSlugMap(fields);
  const fieldTypeMap = new Map(fields.map((f) => [f.slug, f.field_type]));

  // Headers that aren't "id" and don't match a field name
  const reservedHeaders = new Set(["id"]);
  const unknownHeaders = headers.filter(
    (h) => !reservedHeaders.has(h) && !nameToSlug.has(h),
  );

  const parsed: ParsedImportRow[] = rows.map((row) => {
    const data: Record<string, unknown> = {};
    for (const [headerName, rawValue] of Object.entries(row)) {
      if (reservedHeaders.has(headerName)) continue;
      const slug = nameToSlug.get(headerName);
      if (!slug) continue; // unknown header — tracked separately
      const fieldType = fieldTypeMap.get(slug) ?? "text";
      data[slug] = coerceValue(rawValue, fieldType);
    }
    return { data };
  });

  return { rows: parsed, unknownHeaders };
}

export interface ParsedEdgeImportRow {
  source_node_id: string;
  target_node_id: string;
  data: Record<string, unknown>;
}

export interface EdgeImportParseResult {
  rows: ParsedEdgeImportRow[];
  unknownHeaders: string[];
}

export function parseEdgeImportCsv(
  csvString: string,
  fields: FieldDefinition[],
): EdgeImportParseResult {
  const { headers, rows } = parseCsv(csvString);
  const nameToSlug = buildNameToSlugMap(fields);
  const fieldTypeMap = new Map(fields.map((f) => [f.slug, f.field_type]));

  const reservedHeaders = new Set([
    "id",
    "source_node_id",
    "target_node_id",
  ]);
  const unknownHeaders = headers.filter(
    (h) => !reservedHeaders.has(h) && !nameToSlug.has(h),
  );

  const parsed: ParsedEdgeImportRow[] = rows.map((row) => {
    const data: Record<string, unknown> = {};
    for (const [headerName, rawValue] of Object.entries(row)) {
      if (reservedHeaders.has(headerName)) continue;
      const slug = nameToSlug.get(headerName);
      if (!slug) continue;
      const fieldType = fieldTypeMap.get(slug) ?? "text";
      data[slug] = coerceValue(rawValue, fieldType);
    }
    return {
      source_node_id: row["source_node_id"] ?? "",
      target_node_id: row["target_node_id"] ?? "",
      data,
    };
  });

  return { rows: parsed, unknownHeaders };
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvParseError";
  }
}

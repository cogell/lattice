import { fieldValueSchema, type FieldType, FIELD_TYPES } from "./field-types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FieldDefinition {
  slug: string;
  name: string;
  field_type: string;
  required: boolean | number;
  config: unknown;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidateEntityDataOptions {
  /** When true, required-field checks are skipped and only present keys are validated. */
  isUpdate?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRequired(value: boolean | number): boolean {
  return value === true || value === 1;
}

function parseOptions(config: unknown): string[] | null {
  if (
    config != null &&
    typeof config === "object" &&
    "options" in config &&
    Array.isArray((config as Record<string, unknown>).options)
  ) {
    return (config as Record<string, unknown>).options as string[];
  }
  return null;
}

function isValidFieldType(type: string): type is FieldType {
  return (FIELD_TYPES as readonly string[]).includes(type);
}

// ---------------------------------------------------------------------------
// Main validation function
// ---------------------------------------------------------------------------

/**
 * Validate a data object (key/value pairs for a node or edge) against a set
 * of field definitions.
 *
 * Returns `{ valid: true, errors: [] }` when the data is correct, or
 * `{ valid: false, errors: [...] }` with one entry per problem found.
 */
export function validateEntityData(
  data: Record<string, unknown>,
  fields: FieldDefinition[],
  options?: ValidateEntityDataOptions,
): ValidationResult {
  const errors: ValidationError[] = [];
  const isUpdate = options?.isUpdate ?? false;

  // Build a lookup of field definitions by slug for fast access.
  const fieldMap = new Map<string, FieldDefinition>();
  for (const f of fields) {
    fieldMap.set(f.slug, f);
  }

  // 1. Reject unknown keys (strict mode) --------------------------------
  for (const key of Object.keys(data)) {
    if (!fieldMap.has(key)) {
      errors.push({ field: key, message: `Unknown field "${key}"` });
    }
  }

  // 2. Required-field check on create ------------------------------------
  if (!isUpdate) {
    for (const field of fields) {
      if (isRequired(field.required)) {
        const value = data[field.slug];
        if (value === undefined || value === null) {
          errors.push({
            field: field.slug,
            message: `Field "${field.name}" is required`,
          });
        }
      }
    }
  }

  // 3. Type checking per field_type --------------------------------------
  for (const key of Object.keys(data)) {
    const field = fieldMap.get(key);
    if (!field) {
      // Already flagged as unknown above.
      continue;
    }

    const value = data[key];

    // 4. In update mode, skip undefined values (field not being changed).
    if (value === undefined) {
      continue;
    }

    // Allow null for non-required fields (clears the value).
    if (value === null) {
      if (isRequired(field.required)) {
        errors.push({
          field: key,
          message: `Field "${field.name}" is required and cannot be null`,
        });
      }
      continue;
    }

    // Validate against the Zod schema for the base type.
    if (!isValidFieldType(field.field_type)) {
      errors.push({
        field: key,
        message: `Unknown field type "${field.field_type}"`,
      });
      continue;
    }

    const schema = fieldValueSchema[field.field_type];
    const result = schema.safeParse(value);

    if (!result.success) {
      // Build a human-friendly message from the first Zod issue.
      const issue = result.error.issues[0];
      const detail = issue?.message ?? "Invalid value";
      errors.push({ field: key, message: `${detail} (expected ${field.field_type})` });
      continue;
    }

    // Additional option-constraint checks for select / multi_select.
    if (field.field_type === "select" || field.field_type === "multi_select") {
      const allowedOptions = parseOptions(field.config);

      if (allowedOptions) {
        if (field.field_type === "select") {
          if (!allowedOptions.includes(value as string)) {
            errors.push({
              field: key,
              message: `Value "${value}" is not a valid option for "${field.name}". Allowed: ${allowedOptions.join(", ")}`,
            });
          }
        } else {
          // multi_select — value is string[] at this point (Zod passed).
          const vals = value as string[];
          const invalid = vals.filter((v) => !allowedOptions.includes(v));
          if (invalid.length > 0) {
            errors.push({
              field: key,
              message: `Invalid option(s) for "${field.name}": ${invalid.join(", ")}. Allowed: ${allowedOptions.join(", ")}`,
            });
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

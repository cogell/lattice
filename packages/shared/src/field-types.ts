import { z } from "zod";

export const FIELD_TYPES = [
  "text",
  "number",
  "boolean",
  "date",
  "url",
  "email",
  "select",
  "multi_select",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

/** Zod validator for each field type's stored value. */
export const fieldValueSchema: Record<FieldType, z.ZodType> = {
  text: z.string(),
  number: z.number(),
  boolean: z.boolean(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  url: z.string().url(),
  email: z.string().email(),
  select: z.string(),
  multi_select: z.array(z.string()),
};

/** Schema for the field_type column itself. */
export const fieldTypeSchema = z.enum(FIELD_TYPES);

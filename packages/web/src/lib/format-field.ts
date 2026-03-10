/** Metadata describing a single field definition for display. */
export interface FieldMeta {
  name: string
  slug: string
  field_type: string
}

/** Format a field value for display based on its type. */
export function formatFieldValue(value: unknown, fieldType: string): string {
  if (value === null || value === undefined || value === '') return '\u2014'
  if (fieldType === 'boolean') return value ? 'Yes' : 'No'
  if (fieldType === 'json') {
    try {
      return typeof value === 'string' ? value : JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

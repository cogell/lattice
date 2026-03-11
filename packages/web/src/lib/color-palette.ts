/**
 * Shared color palette for node types and edge types.
 * 12 colors from the Tailwind palette that provide good visual distinction.
 */
export const PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#a855f7',
  '#ec4899', '#78716c',
] as const

/**
 * Returns the first palette color not already in use.
 * Falls back to the first palette color if all are taken.
 */
export function getNextColor(usedColors: string[]): string {
  const used = new Set(usedColors)
  return PALETTE.find((c) => !used.has(c)) ?? PALETTE[0]
}

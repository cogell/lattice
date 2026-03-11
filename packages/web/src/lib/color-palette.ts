/**
 * Shared color palette for node types and edge types.
 * 12 Tailwind-derived hex colors.
 */
export const PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#a855f7',
  '#ec4899', '#78716c',
] as const

/**
 * Returns the first palette color not present in `usedColors`.
 * If all palette colors are already used, cycles back to the beginning.
 */
export function getNextColor(usedColors: string[]): string {
  const unused = PALETTE.find((c) => !usedColors.includes(c))
  if (unused) return unused
  return PALETTE[usedColors.length % PALETTE.length]
}

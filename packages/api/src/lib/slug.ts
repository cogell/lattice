/**
 * Generate a snake_case slug from a name.
 * Truncates to 64 characters.
 */
export function toSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_") // replace non-alphanumeric with underscores
    .replace(/^_|_$/g, "") // trim leading/trailing underscores
    .slice(0, 64);
}

/**
 * Generate a unique slug within a scope by appending _2, _3, etc. on collision.
 * @param name - The human-readable name to slugify
 * @param existingSlugs - Set or array of slugs already taken in this scope
 */
export function generateUniqueSlug(
  name: string,
  existingSlugs: string[],
): string {
  const base = toSlug(name);
  if (!existingSlugs.includes(base)) {
    return base;
  }

  let suffix = 2;
  while (existingSlugs.includes(`${base}_${suffix}`)) {
    suffix++;
  }
  return `${base}_${suffix}`.slice(0, 64);
}

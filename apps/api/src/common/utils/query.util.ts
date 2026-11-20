/**
 * Escapes PostgreSQL LIKE/ILIKE wildcard characters (`%`, `_`, `\`) so user
 * search terms match literal substrings.
 *
 * @param value Raw user search query.
 * @returns Escaped pattern safe for `ILIKE '%...%'`.
 */
export function escapeLikePattern(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}

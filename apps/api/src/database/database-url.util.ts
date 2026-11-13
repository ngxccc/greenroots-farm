/**
 * Normalizes PostgreSQL connection URLs for Neon and other managed providers:
 * - strips the `-pooler.` subdomain when a direct connection is required;
 * - upgrades legacy SSL modes to `verify-full`.
 *
 * Kept free of runtime configuration imports so both the application and
 * `drizzle-kit` (which loads `drizzle.config.ts` in a separate process) share
 * one implementation.
 *
 * @param rawUrl Raw connection string.
 * @returns Normalized URL, or `undefined` when absent.
 */
export function normalizeDatabaseUrl(rawUrl?: string): string | undefined {
  if (!rawUrl) return undefined;

  return rawUrl
    .replace("-pooler.", ".")
    .replace(/sslmode=(require|prefer|verify-ca)/gi, "sslmode=verify-full");
}

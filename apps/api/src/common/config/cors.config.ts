/**
 * Resolves configured CORS origins and mirrors localhost / 127.0.0.1 variants for local development.
 *
 * @param corsOrigins Comma-separated origin list from environment configuration.
 * @returns Deduplicated list of allowed HTTP origins.
 */
export function resolveAllowedOrigins(corsOrigins: string): string[] {
  const configuredOrigins = corsOrigins
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return Array.from(
    new Set([
      ...configuredOrigins,
      ...configuredOrigins.map((o) =>
        o.includes("localhost")
          ? o.replace("localhost", "127.0.0.1")
          : o.replace("127.0.0.1", "localhost"),
      ),
    ]),
  );
}

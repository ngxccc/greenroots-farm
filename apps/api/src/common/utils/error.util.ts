import type { DatabaseErrorDetails } from "@/common/constants/error.constant";

const POSTGRES_SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/;

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(
  source: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Walks the error cause chain (Drizzle wraps driver errors) and extracts
 * PostgreSQL SQLSTATE metadata without leaking it to API clients.
 *
 * @param exception Any thrown value.
 * @returns Normalized database error details.
 */
export function extractDatabaseErrorDetails(
  exception: unknown,
): DatabaseErrorDetails {
  let current: unknown = exception;

  for (let depth = 0; depth < 6 && current !== undefined; depth += 1) {
    if (!isRecordObject(current)) break;

    const code = readString(current, "code");
    if (code && POSTGRES_SQLSTATE_PATTERN.test(code)) {
      return {
        isDatabaseError: true,
        code,
        message: readString(current, "message"),
        detail: readString(current, "detail"),
        table: readString(current, "table"),
        column: readString(current, "column"),
        constraint: readString(current, "constraint"),
      };
    }

    current = current["cause"] ?? current["originalError"];
  }

  return { isDatabaseError: false };
}

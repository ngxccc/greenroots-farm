import { sql } from "drizzle-orm";
import { env } from "@/common/config/env.config";
import type { DrizzleDB } from "@/database/database.module";

const qualifiedTablesCache = new WeakMap<DrizzleDB, Map<string, string>>();

/**
 * Truncates every application table in the target schema with cascading
 * identity reset. Migration metadata is preserved and resolved table lists
 * are cached per database client and schema to avoid repeated `pg_tables` scans.
 *
 * @param db Drizzle client.
 * @param schemaName PostgreSQL schema (defaults to `public`).
 */
export async function truncateAllTables(
  db: DrizzleDB,
  schemaName = "public",
): Promise<void> {
  if (env.NODE_ENV === "production") {
    throw new Error(
      "Safety guard: database truncation is prohibited in production.",
    );
  }

  let schemaCache = qualifiedTablesCache.get(db);
  let qualifiedTables = schemaCache?.get(schemaName);

  if (qualifiedTables === undefined) {
    const result = await db.execute(
      sql`SELECT tablename FROM pg_tables WHERE schemaname = ${schemaName};`,
    );

    const queryResult = Array.isArray(result) ? result[0] : result;

    const tables = ((queryResult?.rows ?? []) as { tablename: string }[])
      .map((row) => row.tablename)
      .filter((table) => table !== "__drizzle_migrations");

    if (tables.length === 0) return;

    qualifiedTables = tables
      .map((table) => `"${schemaName}"."${table}"`)
      .join(", ");

    if (!schemaCache) {
      schemaCache = new Map<string, string>();
      qualifiedTablesCache.set(db, schemaCache);
    }
    schemaCache.set(schemaName, qualifiedTables);
  }

  await db.execute(
    sql.raw(`TRUNCATE TABLE ${qualifiedTables} RESTART IDENTITY CASCADE;`),
  );
}

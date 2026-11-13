import { sql } from "drizzle-orm";
import { env } from "@/common/config/env.config";
import type { DrizzleDB } from "@/database/database.module";

/**
 * Truncates every application table in the target schema with cascading
 * identity reset. Migration metadata is preserved.
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

  const result = await db.execute(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = ${schemaName};`,
  );

  const tables = (result.rows as { tablename: string }[])
    .map((row) => row.tablename)
    .filter((table) => table !== "__drizzle_migrations");

  if (tables.length === 0) return;

  const qualifiedTables = tables
    .map((table) => `"${schemaName}"."${table}"`)
    .join(", ");

  await db.execute(
    sql.raw(`TRUNCATE TABLE ${qualifiedTables} RESTART IDENTITY CASCADE;`),
  );
}

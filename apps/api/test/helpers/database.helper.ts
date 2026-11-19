import { randomUUID } from "node:crypto";
import type { Pool, PoolConfig } from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { join } from "node:path";
import { env } from "@/common/config/env.config";
import type { DrizzleDB } from "@/database/database.module";
import {
  createDatabasePool,
  createDrizzleClient,
} from "@/database/database.connection";
import { createMockDb } from "../mocks/mock-database";

export interface TestDatabaseContext {
  pool: Pool;
  db: DrizzleDB;
  schemaName: string;
  isLiveDb: boolean;
}

export function generateWorkerSchemaName(): string {
  const timestamp = Date.now();
  const uuidSegment = randomUUID().replace(/-/g, "_");
  return `test_${timestamp.toString()}_${uuidSegment}`;
}

export function createTestPool(overrides?: PoolConfig): Pool {
  return createDatabasePool(overrides);
}

export async function ensureTemplateSchemaMigrated(
  adminPool: Pool,
): Promise<void> {
  await adminPool.query(`CREATE SCHEMA IF NOT EXISTS "test_template";`);
  const pool = createTestPool({
    options: `-c search_path="test_template",public`,
    max: 2,
  });
  const db = createDrizzleClient(pool);
  const migrationsFolder = join(import.meta.dir, "../../drizzle");
  await migrate(db, { migrationsFolder, migrationsSchema: "test_template" });
  await pool.end().catch(() => undefined);
}

export async function createWorkerTestDatabase(
  existingAdminPool?: Pool,
  customSchemaName?: string,
): Promise<TestDatabaseContext> {
  if (env.NODE_ENV === "production" || process.env.NODE_ENV === "production") {
    throw new Error(
      "Safety guard: Automated test database provisioning is prohibited against production.",
    );
  }

  const schemaName = customSchemaName ?? generateWorkerSchemaName();
  const adminPool =
    existingAdminPool ?? createTestPool({ connectionTimeoutMillis: 500 });
  const shouldCloseAdminPool = !existingAdminPool;

  try {
    // Probe database connectivity
    await adminPool.query("SELECT 1;");
    await adminPool.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}";`);

    const templateCheck = await adminPool
      .query<{ count: string }>(
        `SELECT count(*) FROM pg_tables WHERE schemaname = 'test_template' AND tablename != '__drizzle_migrations';`,
      )
      .catch(() => ({ rows: [{ count: "0" }] }));

    const tableCount = parseInt(templateCheck.rows[0]?.count ?? "0", 10);
    if (tableCount === 0) {
      await ensureTemplateSchemaMigrated(adminPool).catch(() => undefined);
    }

    // Attempt instant table + trigger cloning from template
    const cloneQuery = `
      DO $$
      DECLARE
        r RECORD;
        trig RECORD;
      BEGIN
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'test_template' AND tablename != '__drizzle_migrations') LOOP
          EXECUTE format('CREATE TABLE "%I"."%I" (LIKE "test_template"."%I" INCLUDING ALL);', '${schemaName}', r.tablename, r.tablename);
        END LOOP;
        FOR trig IN (
          SELECT c.relname AS table_name, pg_get_triggerdef(t.oid, true) AS trig_def
          FROM pg_trigger t
          JOIN pg_class c ON c.oid = t.tgrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'test_template' AND NOT t.tgisinternal
        ) LOOP
          EXECUTE regexp_replace(
            trig.trig_def,
            ' ON (?:"?test_template"?\\.)?"?' || trig.table_name || '"?(?= )',
            format(' ON "%I"."%I"', '${schemaName}', trig.table_name)
          );
        END LOOP;
      END $$;
    `;
    await adminPool.query(cloneQuery).catch(async () => {
      // Fallback: direct migrate into schema
      const directPool = createTestPool({
        options: `-c search_path="${schemaName}",public`,
        max: 5,
      });
      const directDb = createDrizzleClient(directPool);
      const migrationsFolder = join(import.meta.dir, "../../drizzle");
      await migrate(directDb, {
        migrationsFolder,
        migrationsSchema: schemaName,
      });
      await directPool.end().catch(() => undefined);
    });

    const pool = createTestPool({
      options: `-c search_path="${schemaName}",public`,
      max: 10,
    });
    const db = createDrizzleClient(pool);

    return { pool, db, schemaName, isLiveDb: true };
  } catch {
    // Database is offline; fall back cleanly to mock DB so suites don't hard crash
    return {
      pool: adminPool,
      db: createMockDb(),
      schemaName: "mock_schema",
      isLiveDb: false,
    };
  } finally {
    if (shouldCloseAdminPool) {
      await adminPool.end().catch(() => undefined);
    }
  }
}

export async function teardownWorkerTestDatabase(
  ctx: TestDatabaseContext,
  existingAdminPool?: Pool,
): Promise<void> {
  if (!ctx.isLiveDb) return;

  await ctx.pool.end().catch(() => undefined);

  const adminPool = existingAdminPool ?? createTestPool();
  const shouldCloseAdminPool = !existingAdminPool;

  try {
    await dropTestSchema(adminPool, ctx.schemaName);
  } finally {
    if (shouldCloseAdminPool) {
      await adminPool.end().catch(() => undefined);
    }
  }
}

export async function dropTestSchema(
  pool: Pool,
  schemaName: string,
): Promise<void> {
  if (/^test_\d+_[a-f0-9_]+$/.test(schemaName)) {
    await pool
      .query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE;`)
      .catch(() => undefined);
  }
}

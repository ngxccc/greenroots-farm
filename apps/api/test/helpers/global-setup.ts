import "@nestjs/core";
import "@nestjs/testing";
import type { Pool } from "pg";
import { Logger } from "@nestjs/common";
import { spyOn } from "bun:test";
import { env } from "@/common/config/env.config";
import {
  createTestPool,
  dropTestSchema,
  ensureTemplateSchemaMigrated,
} from "./database.helper";
import {
  probeInfrastructure,
  printInfrastructureFailureAlert,
} from "./infra-probe.helper";

// Suppress intentional NestJS log noise during unit and e2e test suites to keep terminal output clean.
Logger.overrideLogger(false);
spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
spyOn(Logger.prototype, "debug").mockImplementation(() => undefined);
spyOn(Logger.prototype, "verbose").mockImplementation(() => undefined);

export const ORPHAN_SCHEMA_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

/**
 * Sweeps and purges leftover test schemas from crashed or interrupted test executions.
 */
export async function cleanupOrphanTestSchemas(pool: Pool): Promise<void> {
  try {
    const result = await pool.query<{ schema_name: string }>(
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'test_%';",
    );

    const now = Date.now();
    for (const row of result.rows) {
      const match = /^test_(\d+)_[a-f0-9_]+$/.exec(row.schema_name);
      if (!match) continue;

      const rawTimestamp = match[1];
      if (!rawTimestamp) continue;

      const schemaTimestamp = parseInt(rawTimestamp, 10);
      if (isNaN(schemaTimestamp)) continue;

      if (now - schemaTimestamp > ORPHAN_SCHEMA_MAX_AGE_MS) {
        await dropTestSchema(pool, row.schema_name);
      }
    }
  } catch {
    // Fail-open if DB is unreachable
  }
}

/**
 * Global pre-flight initialization hook executed before parallel test workers spawn.
 * Enforces Fail-Fast probe against offline Docker dependencies.
 */
let isGlobalEnvInitialized = false;

export async function setupGlobalTestEnvironment(): Promise<void> {
  if (env.NODE_ENV === "production" || process.env.NODE_ENV === "production") {
    throw new Error(
      "Safety Guard: Test suite execution is prohibited against production environment.",
    );
  }

  if (isGlobalEnvInitialized) return;

  const isRunningIntegrationTest = process.argv.some(
    (arg) =>
      arg.includes("test/") ||
      arg.includes(".e2e") ||
      arg.includes(".integration"),
  );

  if (!isRunningIntegrationTest) {
    return;
  }

  isGlobalEnvInitialized = true;

  // Layer 1: Fail-fast infrastructure probe
  const infra = await probeInfrastructure(500);
  if (!infra.isReady) {
    printInfrastructureFailureAlert(infra);
    process.exit(1);
  }

  const pool = createTestPool({ max: 2, connectionTimeoutMillis: 1000 });
  try {
    await pool.query("SELECT 1;");
    await ensureTemplateSchemaMigrated(pool);
    await cleanupOrphanTestSchemas(pool);
  } catch {
    // Fail-open gracefully if DB had an intermittent migration hiccup
  } finally {
    await pool.end().catch(() => undefined);
  }
}

// Bunfig preload executes this file before worker suites spawn
await setupGlobalTestEnvironment();

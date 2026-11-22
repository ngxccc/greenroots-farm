import "./test-env";
import { readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import Redis from "ioredis";
import { env } from "@/common/config/env.config";
import { parseRedisOptions } from "@/common/config/redis.config";
import {
  createTestPool,
  ensureTemplateSchemaMigrated,
} from "./database.helper";
import { cleanupOrphanTestSchemas } from "./global-setup";
import {
  printInfrastructureFailureAlert,
  probeInfrastructure,
} from "./infra-probe.helper";

const API_ROOT = path.resolve(import.meta.dir, "../..");
const DEFAULT_TEST_ROOT = path.join(API_ROOT, "test");
const E2E_FILE_PATTERN = /\.(?:spec|test)\.[cm]?[jt]sx?$/i;
const IGNORED_TEST_DIRS = new Set([
  "helpers",
  "factories",
  "mocks",
  "generated",
]);

/** Highest logical Redis database reserved for isolated parallel E2E workers (`1..15`). */
export const MAX_REDIS_WORKER_DB = 15;

/** Default bounded concurrency matching local Docker Compose `cpus: "2.00"` Postgres limit. */
export const DEFAULT_E2E_CONCURRENCY = 4;

/** Result captured for a single E2E test file execution. */
export interface E2eFileResult {
  readonly filePath: string;
  readonly workerSlot: number;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
}

/** Parsed CLI flags and positional file filters for the E2E runner. */
export interface ParsedE2eCliArgs {
  readonly concurrencyOverride?: number;
  readonly filters: readonly string[];
  readonly passthroughArgs: readonly string[];
}

/**
 * Parses CLI flags (`--concurrency` / `--concurrency=N`), positional test filters,
 * and extra flags forwarded to each `bun test` worker invocation.
 *
 * @param args Raw CLI arguments (`process.argv.slice(2)`).
 * @returns Structured runner configuration and passthrough arguments.
 */
export function parseE2eCliArgs(args: readonly string[]): ParsedE2eCliArgs {
  let concurrencyOverride: number | undefined;
  const filters: string[] = [];
  const passthroughArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    if (arg === "--concurrency") {
      const next = args[i + 1];
      if (!next || next.startsWith("-")) {
        throw new Error("Missing integer value after --concurrency.");
      }
      concurrencyOverride = Number.parseInt(next, 10);
      if (!Number.isFinite(concurrencyOverride) || concurrencyOverride < 1) {
        throw new Error(`Invalid --concurrency value: ${next}`);
      }
      i++;
      continue;
    }

    if (arg.startsWith("--concurrency=")) {
      const rawValue = arg.slice("--concurrency=".length);
      concurrencyOverride = Number.parseInt(rawValue, 10);
      if (!Number.isFinite(concurrencyOverride) || concurrencyOverride < 1) {
        throw new Error(`Invalid --concurrency value: ${rawValue}`);
      }
      continue;
    }

    if (arg.startsWith("-")) {
      passthroughArgs.push(arg);
    } else {
      filters.push(arg);
    }
  }

  return { concurrencyOverride, filters, passthroughArgs };
}

/**
 * Resolves bounded E2E worker concurrency, clamping to `[1, min(15, cpuCount)]`.
 *
 * @param cliOverride Optional `--concurrency` CLI flag.
 * @param envValue Optional `E2E_CONCURRENCY` environment override.
 * @param cpuCount Available CPU thread count (defaults to host parallelism).
 * @returns Effective worker pool size in `1..15`.
 */
export function resolveE2eConcurrency(
  cliOverride?: number,
  envValue: string | undefined = process.env["E2E_CONCURRENCY"],
  cpuCount: number = os.availableParallelism(),
): number {
  const maxWorkers = Math.min(MAX_REDIS_WORKER_DB, Math.max(1, cpuCount));
  let requested = DEFAULT_E2E_CONCURRENCY;

  if (cliOverride !== undefined) {
    requested = cliOverride;
  } else if (envValue !== undefined && envValue.trim().length > 0) {
    const parsedEnv = Number.parseInt(envValue.trim(), 10);
    if (!Number.isFinite(parsedEnv) || parsedEnv < 1) {
      throw new Error(`Invalid E2E_CONCURRENCY value: ${envValue}`);
    }
    requested = parsedEnv;
  }

  return Math.max(1, Math.min(requested, maxWorkers));
}

/**
 * Rewrites `redisUrl` to point at an isolated Redis logical database index (`1..15`)
 * so parallel E2E workers never collide on app caches, queues, Lua locks, or revocations.
 *
 * @param redisUrl Base Redis connection URL.
 * @param workerSlot 1-based worker slot identifier (`1..15`).
 * @returns Worker-scoped Redis connection URL.
 */
export function withRedisWorkerDb(
  redisUrl: string,
  workerSlot: number,
): string {
  if (
    !Number.isInteger(workerSlot) ||
    workerSlot < 1 ||
    workerSlot > MAX_REDIS_WORKER_DB
  ) {
    throw new Error(
      `Invalid E2E Redis worker slot ${workerSlot}; expected integer in 1..${MAX_REDIS_WORKER_DB}.`,
    );
  }

  const parsed = new URL(redisUrl);
  parsed.pathname = `/${workerSlot}`;
  return parsed.toString();
}

/**
 * Recursively discovers E2E `.spec.*` / `.test.*` files under `testRoot`, skipping
 * helper/mock/factory support directories and ordering largest files first to avoid tail latency.
 *
 * @param testRoot Absolute directory to search (defaults to `apps/api/test`).
 * @param filters Optional substring filters matching relative or basename paths.
 * @returns Ordered list of relative POSIX test file paths from `API_ROOT` (or `testRoot` when custom).
 */
export function discoverE2eTestFiles(
  testRoot: string = DEFAULT_TEST_ROOT,
  filters: readonly string[] = [],
): string[] {
  const collected: { relPath: string; size: number }[] = [];

  function walk(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_TEST_DIRS.has(entry.name)) continue;
        walk(fullPath);
        continue;
      }
      if (!entry.isFile() || !E2E_FILE_PATTERN.test(entry.name)) {
        continue;
      }
      const relPath = path.relative(API_ROOT, fullPath).replace(/\\/g, "/");
      const size = statSync(fullPath).size;
      collected.push({ relPath, size });
    }
  }

  walk(testRoot);

  const filtered =
    filters.length === 0
      ? collected
      : collected.filter((item) =>
          filters.some((f) => item.relPath.includes(f)),
        );

  // Schedule heaviest files (e.g. auth.spec.ts) first so workers finish evenly without a long tail.
  filtered.sort(
    (a, b) => b.size - a.size || a.relPath.localeCompare(b.relPath),
  );
  return filtered.map((item) => item.relPath);
}

/**
 * Runs E2E test files across a bounded worker pool while preserving fail-closed error tracking.
 *
 * @param files Ordered E2E test file paths.
 * @param concurrency Maximum active worker count.
 * @param runFileWorker Executor invoked for `(filePath, workerSlot)`.
 * @returns Results in execution completion order and aggregate failure status.
 */
export async function runE2ePool(
  files: readonly string[],
  concurrency: number,
  runFileWorker: (
    filePath: string,
    workerSlot: number,
  ) => Promise<E2eFileResult>,
): Promise<E2eFileResult[]> {
  if (files.length === 0) return [];

  const workerCount = Math.max(1, Math.min(concurrency, files.length));
  let cursor = 0;
  const results: E2eFileResult[] = [];

  async function runWorkerSlot(workerSlot: number): Promise<void> {
    while (cursor < files.length) {
      const index = cursor++;
      const filePath = files[index];
      if (filePath === undefined) return;
      const result = await runFileWorker(filePath, workerSlot);
      results.push(result);
    }
  }

  await Promise.all(
    Array.from({ length: workerCount }, (_, idx) => runWorkerSlot(idx + 1)),
  );

  return results;
}

async function flushRedisWorkerDbs(
  baseRedisUrl: string,
  workerCount: number,
): Promise<void> {
  await Promise.all(
    Array.from({ length: workerCount }, async (_, idx) => {
      const slot = idx + 1;
      const client = new Redis({
        ...parseRedisOptions(withRedisWorkerDb(baseRedisUrl, slot)),
        connectTimeout: 1000,
        commandTimeout: 1000,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
      });
      client.on("error", () => undefined);
      try {
        await client.flushdb();
      } finally {
        await client.quit().catch(() => {
          client.disconnect();
        });
      }
    }),
  );
}

async function spawnE2eFileWorker(
  filePath: string,
  workerSlot: number,
  baseRedisUrl: string,
  passthroughArgs: readonly string[],
): Promise<E2eFileResult> {
  const startedAt = performance.now();
  const proc = Bun.spawn(
    [process.execPath, "test", filePath, ...passthroughArgs],
    {
      cwd: API_ROOT,
      env: {
        ...process.env,
        NODE_ENV: "test",
        REDIS_URL: withRedisWorkerDb(baseRedisUrl, workerSlot),
        E2E_PREWARMED: "1",
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return {
    filePath,
    workerSlot,
    exitCode,
    stdout,
    stderr,
    durationMs: performance.now() - startedAt,
  };
}

async function prewarmInfrastructure(
  baseRedisUrl: string,
  workerCount: number,
): Promise<void> {
  if (env.NODE_ENV === "production" || process.env.NODE_ENV === "production") {
    throw new Error(
      "Safety Guard: E2E execution is prohibited against production environment.",
    );
  }

  const infra = await probeInfrastructure(500);
  if (!infra.isReady) {
    printInfrastructureFailureAlert(infra);
    process.exit(1);
  }

  const adminPool = createTestPool({ max: 2, connectionTimeoutMillis: 1000 });
  try {
    await adminPool.query("SELECT 1;");
    await ensureTemplateSchemaMigrated(adminPool);
    await cleanupOrphanTestSchemas(adminPool);
  } finally {
    await adminPool.end().catch(() => undefined);
  }

  await flushRedisWorkerDbs(baseRedisUrl, workerCount);
}

async function main(): Promise<void> {
  const startedAt = performance.now();
  const parsed = parseE2eCliArgs(process.argv.slice(2));
  const files = discoverE2eTestFiles(DEFAULT_TEST_ROOT, parsed.filters);

  if (files.length === 0) {
    console.error("No E2E test files matched.");
    process.exit(1);
  }

  const concurrency = Math.min(
    resolveE2eConcurrency(parsed.concurrencyOverride),
    files.length,
  );
  const baseRedisUrl = process.env["REDIS_URL"] ?? env.REDIS_URL;

  await prewarmInfrastructure(baseRedisUrl, concurrency);

  let results: E2eFileResult[] = [];
  try {
    results = await runE2ePool(files, concurrency, async (filePath, slot) => {
      const result = await spawnE2eFileWorker(
        filePath,
        slot,
        baseRedisUrl,
        parsed.passthroughArgs,
      );
      const status = result.exitCode === 0 ? "PASS" : "FAIL";
      console.log(
        `[worker-${result.workerSlot}] ${status} ${result.filePath} (${(result.durationMs / 1000).toFixed(2)}s)`,
      );
      if (result.exitCode !== 0) {
        if (result.stdout.trim()) process.stdout.write(result.stdout);
        if (result.stderr.trim()) process.stderr.write(result.stderr);
      }
      return result;
    });
  } finally {
    await flushRedisWorkerDbs(baseRedisUrl, concurrency).catch(() => undefined);
  }

  const failed = results.filter((r) => r.exitCode !== 0);
  const elapsedSec = ((performance.now() - startedAt) / 1000).toFixed(2);

  if (failed.length > 0) {
    console.error(
      `\nE2E suite failed: ${failed.length}/${results.length} file(s) failed across ${concurrency} workers [${elapsedSec}s].`,
    );
    process.exit(1);
  }

  console.log(
    `\nE2E suite passed: ${results.length} files across ${concurrency} workers [${elapsedSec}s].`,
  );
}

if (import.meta.main) {
  await main();
}

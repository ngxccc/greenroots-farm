import { parseArgs } from "node:util";
import type { Pool } from "pg";
import {
  createDatabasePool,
  createDrizzleClient,
} from "@/database/database.connection";
import type { DrizzleDB } from "@/database/database.module";
import { seedDatabase } from "./seed.orchestrator";

function createCliDatabaseConnection(): { pool: Pool; db: DrizzleDB } {
  const pool = createDatabasePool();
  const db = createDrizzleClient(pool);
  return { pool, db };
}

function printHelp(): void {
  console.log(`
GreenRoots Farm - Database Seeding Engine

Usage:
  bun run db:seed [options]

Options:
  -c, --clean   Truncate all application tables, then reseed (blocked in production)
  -r, --reset   Alias for --clean
  -h, --help    Show this help message

Demo password for every seeded account: GreenRoots@2026
`);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      clean: { type: "boolean", short: "c", default: false },
      reset: { type: "boolean", short: "r", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: false,
    strict: false,
  });

  if (values.help) {
    printHelp();
    return;
  }

  const clean = Boolean(values.clean) || Boolean(values.reset);
  const { pool, db } = createCliDatabaseConnection();

  try {
    console.log(
      `\n[SEED] Starting three-tier seeding (clean: ${String(clean)})...`,
    );

    const summary = await seedDatabase(db, { clean });

    console.log(
      `\n[SUCCESS] Seeding completed in ${String(summary.durationMs)}ms:\n`,
    );
    console.table({
      "Farms (Tier 1)": summary.farms,
      "Users (Tier 1)": summary.users,
      "Plots (Tier 2)": summary.plots,
      "Seasons (Tier 2)": summary.seasons,
      "Categories (Tier 2)": summary.categories,
      "Products (Tier 2)": summary.products,
      "Batches (Tier 2)": summary.batches,
      "Farming Logs (Tier 2)": summary.farmingLogs,
      "Waste Logs (Tier 2)": summary.wasteLogs,
      "Subscription Plans (Tier 2)": summary.subscriptionPlans,
      "Addresses (Tier 3)": summary.userAddresses,
      "Orders (Tier 3)": summary.orders,
      "Order Items (Tier 3)": summary.orderItems,
      "Batch Allocations (Tier 3)": summary.batchAllocations,
      "Subscriptions (Tier 3)": summary.subscriptions,
      "Payments (Tier 3)": summary.payments,
      "Complaints (Tier 3)": summary.complaints,
    });
  } catch (error) {
    console.error(
      `\n[FAILURE] Database seeding failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();

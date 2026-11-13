import type { DrizzleDB } from "@/database/database.module";
import { truncateAllTables } from "@/database/utils/truncate.util";
import { seedTier1Reference } from "./tiers/tier1-reference.seeder";
import { seedTier2Catalog } from "./tiers/tier2-catalog.seeder";
import { seedTier3Operational } from "./tiers/tier3-operational.seeder";
import type { SeedOptions, SeedSummary } from "./types/seed.type";

/**
 * Runs the three-tier seed pipeline in dependency order.
 *
 * `clean: true` truncates all application tables first, then reseeds so
 * `bun run db:seed --clean` always leaves a usable dataset behind.
 */
export async function seedDatabase(
  db: DrizzleDB,
  options: SeedOptions = {},
): Promise<SeedSummary> {
  const startedAt = Date.now();

  if (options.clean) {
    await truncateAllTables(db);
  }

  const tier1 = await seedTier1Reference(db);
  const tier2 = await seedTier2Catalog(db);
  const tier3 = await seedTier3Operational(db);

  return {
    farms: tier1.farms,
    users: tier1.users,
    plots: tier2.plots,
    seasons: tier2.seasons,
    categories: tier2.categories,
    products: tier2.products,
    batches: tier2.batches,
    farmingLogs: tier2.farmingLogs,
    wasteLogs: tier2.wasteLogs,
    subscriptionPlans: tier2.subscriptionPlans,
    userAddresses: tier3.userAddresses,
    orders: tier3.orders,
    orderItems: tier3.orderItems,
    batchAllocations: tier3.batchAllocations,
    subscriptions: tier3.subscriptions,
    payments: tier3.payments,
    complaints: tier3.complaints,
    durationMs: Date.now() - startedAt,
  };
}

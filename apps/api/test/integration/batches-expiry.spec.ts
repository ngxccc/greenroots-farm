import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import { type INestApplication } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import { BatchStatus } from "@greenroots/shared";
import { TIME_IN_MS } from "@/common/constants/time.constant";
import { RedisService } from "@/common/services/redis.service";
import { batches } from "@/database/schemas";
import {
  FARM_SETTINGS_CACHE_KEY,
  FARM_SETTINGS_INVALIDATED_AT_KEY,
  TRACE_CACHE_PREFIX,
  TRACE_FARM_VERSION_KEY,
  TRACE_INVALIDATED_AT_PREFIX,
} from "@/modules/farms/farms.constant";
import { BatchesExpiryService } from "@/modules/inventory/batches-expiry.service";
import {
  createBatch,
  createFarm,
  createPlot,
  createProduct,
  createSeason,
  SeasonMother,
} from "../factories";
import {
  cleanScopedRedisKeys,
  createTestApp,
  teardownTestApp,
  type TestAppSetup,
} from "../helpers/app.helper";

describe("Batches Expiry Integration", () => {
  let setup: TestAppSetup;
  let app: INestApplication;
  let service: BatchesExpiryService;
  let appRedisClient: ReturnType<RedisService["getClient"]>;

  beforeAll(async () => {
    setup = await createTestApp();
    app = setup.app;
    service = app.get(BatchesExpiryService);
    appRedisClient = app.get(RedisService).getClient();
  }, 30000);

  beforeEach(async () => {
    await setup.db.execute(
      sql`TRUNCATE TABLE "batches", "products", "categories", "farming_logs", "seasons", "plots", "farms", "users" CASCADE;`,
    );
    await cleanScopedRedisKeys(setup.redisClient);
    await appRedisClient
      .unlink(
        FARM_SETTINGS_CACHE_KEY,
        FARM_SETTINGS_INVALIDATED_AT_KEY,
        TRACE_FARM_VERSION_KEY,
      )
      .catch(() => undefined);
  });

  afterAll(async () => {
    await teardownTestApp(setup);
  });

  async function seedFarmCatalogGraph(hoursThreshold = 48) {
    const farm = await createFarm(setup.db, {
      flashSaleConfig: { hoursThreshold, discountPercent: 50 },
    });
    const plot = await createPlot(setup.db, { farmId: farm.id });
    const season = await createSeason(
      setup.db,
      SeasonMother.active({ plotId: plot.id }),
    );
    const product = await createProduct(setup.db);
    return { farm, plot, season, product };
  }

  describe("BatchesExpiryService.runSweep", () => {
    // Invariant: INV-BEXP-1, INV-BEXP-2, INV-BEXP-3
    it("transitions expired and near-expiry batches while preserving non-demotion, sold_out, and idempotency", async () => {
      const now = new Date("2026-11-27T12:00:00.000Z");
      const harvestDate = new Date(now.getTime() - 10 * TIME_IN_MS.DAY);
      const { season, product } = await seedFarmCatalogGraph(48);

      // Direct IN_STOCK -> EXPIRED (exact boundary expirationDate === now)
      const inStockExpired = await createBatch(setup.db, {
        seasonId: season.id,
        productId: product.id,
        harvestDate,
        expirationDate: now,
        status: BatchStatus.IN_STOCK,
      });

      // NEAR_EXPIRY -> EXPIRED
      const nearExpiryExpired = await createBatch(setup.db, {
        seasonId: season.id,
        productId: product.id,
        harvestDate,
        expirationDate: new Date(now.getTime() - TIME_IN_MS.HOUR),
        status: BatchStatus.NEAR_EXPIRY,
      });

      // IN_STOCK -> NEAR_EXPIRY (24h remaining < 48h threshold)
      const enteringNearExpiry = await createBatch(setup.db, {
        seasonId: season.id,
        productId: product.id,
        harvestDate,
        expirationDate: new Date(now.getTime() + 24 * TIME_IN_MS.HOUR),
        status: BatchStatus.IN_STOCK,
      });

      // Boundary: exact threshold (48h remaining) remains IN_STOCK
      const atThresholdInStock = await createBatch(setup.db, {
        seasonId: season.id,
        productId: product.id,
        harvestDate,
        expirationDate: new Date(now.getTime() + 48 * TIME_IN_MS.HOUR),
        status: BatchStatus.IN_STOCK,
      });

      // Non-demotion: NEAR_EXPIRY beyond threshold stays NEAR_EXPIRY
      const nonDemotedNearExpiry = await createBatch(setup.db, {
        seasonId: season.id,
        productId: product.id,
        harvestDate,
        expirationDate: new Date(now.getTime() + 72 * TIME_IN_MS.HOUR),
        status: BatchStatus.NEAR_EXPIRY,
      });

      // SOLD_OUT stays SOLD_OUT even when past expirationDate
      const soldOutBatch = await createBatch(setup.db, {
        seasonId: season.id,
        productId: product.id,
        harvestDate,
        expirationDate: new Date(now.getTime() - TIME_IN_MS.HOUR),
        initialQuantity: "10.00",
        availableQuantity: "0.00",
        status: BatchStatus.SOLD_OUT,
      });

      const firstSweep = await service.runSweep(now);
      expect(firstSweep).toEqual({ expired: 2, nearExpiry: 1 });

      const rows = await setup.db
        .select({ id: batches.id, status: batches.status })
        .from(batches);
      const statusById = new Map(rows.map((row) => [row.id, row.status]));

      expect(statusById.get(inStockExpired.id)).toBe(BatchStatus.EXPIRED);
      expect(statusById.get(nearExpiryExpired.id)).toBe(BatchStatus.EXPIRED);
      expect(statusById.get(enteringNearExpiry.id)).toBe(
        BatchStatus.NEAR_EXPIRY,
      );
      expect(statusById.get(atThresholdInStock.id)).toBe(BatchStatus.IN_STOCK);
      expect(statusById.get(nonDemotedNearExpiry.id)).toBe(
        BatchStatus.NEAR_EXPIRY,
      );
      expect(statusById.get(soldOutBatch.id)).toBe(BatchStatus.SOLD_OUT);

      // Re-running at the same timestamp is idempotent
      const secondSweep = await service.runSweep(now);
      expect(secondSweep).toEqual({ expired: 0, nearExpiry: 0 });
    });

    // Invariant: INV-BEXP-5
    it("invalidates Redis trace cache only for transitioned batches after commit", async () => {
      const now = new Date("2026-11-27T12:00:00.000Z");
      const harvestDate = new Date(now.getTime() - 10 * TIME_IN_MS.DAY);
      const { season, product } = await seedFarmCatalogGraph(48);

      const transitionedBatch = await createBatch(setup.db, {
        seasonId: season.id,
        productId: product.id,
        harvestDate,
        expirationDate: new Date(now.getTime() + 12 * TIME_IN_MS.HOUR),
        status: BatchStatus.IN_STOCK,
      });

      const untouchedBatch = await createBatch(setup.db, {
        seasonId: season.id,
        productId: product.id,
        harvestDate,
        expirationDate: new Date(now.getTime() + 96 * TIME_IN_MS.HOUR),
        status: BatchStatus.IN_STOCK,
      });

      const transitionedKey = `${TRACE_CACHE_PREFIX}${transitionedBatch.batchCode}`;
      const untouchedKey = `${TRACE_CACHE_PREFIX}${untouchedBatch.batchCode}`;
      await appRedisClient.set(transitionedKey, "stale-trace", "EX", 60);
      await appRedisClient.set(untouchedKey, "fresh-trace", "EX", 60);

      const result = await service.runSweep(now);
      expect(result).toEqual({ expired: 0, nearExpiry: 1 });

      expect(await appRedisClient.get(transitionedKey)).toBeNull();
      expect(
        await appRedisClient.get(
          `${TRACE_INVALIDATED_AT_PREFIX}${transitionedBatch.batchCode}`,
        ),
      ).not.toBeNull();
      expect(await appRedisClient.get(untouchedKey)).toBe("fresh-trace");
    });

    // Invariant: INV-BEXP-4
    it("skips row-locked batches without blocking and transitions them on the next sweep", async () => {
      const now = new Date("2026-11-27T12:00:00.000Z");
      const harvestDate = new Date(now.getTime() - 10 * TIME_IN_MS.DAY);
      const { season, product } = await seedFarmCatalogGraph(48);

      const lockedBatch = await createBatch(setup.db, {
        seasonId: season.id,
        productId: product.id,
        harvestDate,
        expirationDate: new Date(now.getTime() - TIME_IN_MS.HOUR),
        status: BatchStatus.IN_STOCK,
      });

      const unlockedBatch = await createBatch(setup.db, {
        seasonId: season.id,
        productId: product.id,
        harvestDate,
        expirationDate: new Date(now.getTime() - TIME_IN_MS.HOUR),
        status: BatchStatus.NEAR_EXPIRY,
      });

      let signalLockAcquired!: () => void;
      const lockAcquired = new Promise<void>((resolve) => {
        signalLockAcquired = resolve;
      });
      let releaseLock!: () => void;
      const waitForRelease = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });

      const lockHolder = setup.db.transaction(async (tx) => {
        await tx
          .select({ id: batches.id })
          .from(batches)
          .where(eq(batches.id, lockedBatch.id))
          .for("update");
        signalLockAcquired();
        await waitForRelease;
      });

      await lockAcquired;
      const sweepWhileLocked = await service.runSweep(now);
      expect(sweepWhileLocked).toEqual({ expired: 1, nearExpiry: 0 });

      releaseLock();
      await lockHolder;

      const [lockedAfterFirstSweep] = await setup.db
        .select({ status: batches.status })
        .from(batches)
        .where(eq(batches.id, lockedBatch.id));
      const [unlockedAfterFirstSweep] = await setup.db
        .select({ status: batches.status })
        .from(batches)
        .where(eq(batches.id, unlockedBatch.id));

      expect(lockedAfterFirstSweep?.status).toBe(BatchStatus.IN_STOCK);
      expect(unlockedAfterFirstSweep?.status).toBe(BatchStatus.EXPIRED);

      const sweepAfterUnlock = await service.runSweep(now);
      expect(sweepAfterUnlock).toEqual({ expired: 1, nearExpiry: 0 });

      const [lockedAfterSecondSweep] = await setup.db
        .select({ status: batches.status })
        .from(batches)
        .where(eq(batches.id, lockedBatch.id));
      expect(lockedAfterSecondSweep?.status).toBe(BatchStatus.EXPIRED);
    });
  });
});

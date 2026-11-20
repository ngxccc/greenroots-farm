import { randomUUID } from "node:crypto";
import {
  BatchStatus,
  BUSINESS_RULES,
  FarmingActionType,
  SeasonStatus,
  UserRole,
} from "@greenroots/shared";
import { env } from "@/common/config/env.config";
import type { DrizzleDB } from "@/database/database.module";
import {
  batches,
  categories,
  farmingLogs,
  farms,
  plots,
  products,
  seasons,
  type Batch,
  type Farm,
  type FarmingLog,
  type NewBatch,
  type NewFarm,
  type NewFarmingLog,
  type NewPlot,
  type NewSeason,
  type Plot,
  type Season,
} from "@/database/schemas";
import { createUser } from "./user.factory";

/**
 * Inserts a farm row with sensible defaults for isolated integration tests.
 *
 * @param db Drizzle database client.
 * @param overrides Optional column overrides.
 * @returns Inserted `farms` row.
 */
export async function createFarm(
  db: DrizzleDB,
  overrides: Partial<NewFarm> = {},
): Promise<Farm> {
  const cloudName = env.CLOUDINARY_CLOUD_NAME;

  const [farm] = await db
    .insert(farms)
    .values({
      name: BUSINESS_RULES.FARM_COORDINATES.NAME,
      legalName: "Công ty TNHH Nông nghiệp Hữu cơ GreenRoots",
      tagline: "Rau hữu cơ tươi mỗi ngày từ nông trại đến bàn ăn",
      taxId: "0316987654",
      address: BUSINESS_RULES.FARM_COORDINATES.ADDRESS,
      latitude: BUSINESS_RULES.FARM_COORDINATES.LATITUDE.toFixed(8),
      longitude: BUSINESS_RULES.FARM_COORDINATES.LONGITUDE.toFixed(8),
      certificationUrl: `https://res.cloudinary.com/${cloudName}/image/upload/v1/farms/vietgap-cert.png`,
      hotlines: { primary: "0909123456", support: "02838991234" },
      emails: {
        primary: "hello@greenroots.farm",
        support: "hotro@greenroots.farm",
      },
      workingHours: { weekdays: "07:00 - 18:00", weekend: "07:00 - 12:00" },
      bankInfo: {
        bankName: "Vietcombank",
        accountNumber: "0071001234567",
        accountHolder: "CONG TY TNHH NONG NGHIEP HUU CO GREENROOTS",
      },
      shippingConfig: {
        baseFeeVnd: BUSINESS_RULES.SHIPPING.BASE_FEE_VND,
        freeKmThreshold: BUSINESS_RULES.SHIPPING.FREE_KM_THRESHOLD,
        perKmRateVnd: BUSINESS_RULES.SHIPPING.PER_KM_RATE_VND,
        detourFactor: BUSINESS_RULES.SHIPPING.DETOUR_FACTOR,
      },
      flashSaleConfig: {
        hoursThreshold: BUSINESS_RULES.FLASH_SALE_HOURS_THRESHOLD,
        discountPercent: BUSINESS_RULES.FLASH_SALE_DISCOUNT_PERCENT,
      },
      isPayosEnabled: true,
      isCodEnabled: true,
      ...overrides,
    })
    .returning();

  if (!farm) {
    throw new Error("Failed to create Farm entity in test factory");
  }

  return farm;
}

/**
 * Named domain presets for farm records.
 */
export const FarmMother = {
  /** Standard operational singleton farm with both PayOS and COD enabled. */
  default: (overrides: Partial<NewFarm> = {}): Partial<NewFarm> => ({
    ...overrides,
  }),
};

/**
 * Inserts a cultivation plot row, provisioning a parent farm automatically if omitted.
 *
 * @param db Drizzle database client.
 * @param overrides Optional column overrides.
 * @returns Inserted `plots` row.
 */
export async function createPlot(
  db: DrizzleDB,
  overrides: Partial<NewPlot> = {},
): Promise<Plot> {
  const uid = randomUUID().slice(0, 8).toUpperCase();
  const farmId = overrides.farmId ?? (await createFarm(db)).id;

  const [plot] = await db
    .insert(plots)
    .values({
      farmId,
      plotCode: `PLOT-${uid}`,
      name: `Lô canh tác ${uid}`,
      areaSqm: "1200.00",
      ...overrides,
    })
    .returning();

  if (!plot) {
    throw new Error("Failed to create Plot entity in test factory");
  }

  return plot;
}

/**
 * Named domain presets for plot test fixtures.
 */
export const PlotMother = {
  /** Basic active plot without lab test results. */
  standard: (overrides: Partial<NewPlot> = {}): Partial<NewPlot> => ({
    areaSqm: "850.00",
    ...overrides,
  }),

  /** Plot populated with structured soil and water laboratory test payloads. */
  withLabTests: (overrides: Partial<NewPlot> = {}): Partial<NewPlot> => {
    const cloudName = env.CLOUDINARY_CLOUD_NAME;
    return {
      areaSqm: "1500.00",
      soilTestResult: {
        ph: 6.5,
        nitrogen_ppm: 40,
        phosphorus_ppm: 30,
        potassium_ppm: 35,
        heavy_metals: { lead_ppm: 0.02, cadmium_ppm: 0.01, pass: true },
        tested_at: "2026-10-01T02:00:00.000Z",
        certificate_url: `https://res.cloudinary.com/${cloudName}/image/upload/v1/plots/soil-test.png`,
      },
      waterTestResult: {
        ph: 7.0,
        ec_ms_cm: 0.75,
        dissolved_oxygen_ppm: 6.8,
        e_coli_cfu_100ml: 0,
        heavy_metals_pass: true,
        tested_at: "2026-10-01T02:00:00.000Z",
        certificate_url: `https://res.cloudinary.com/${cloudName}/image/upload/v1/plots/water-test.png`,
      },
      ...overrides,
    };
  },
};

/**
 * Inserts a season row bound to a plot for testing soft-delete referential guards.
 *
 * @param db Drizzle database client.
 * @param overrides Optional column overrides (`plotId` provisioned automatically if omitted).
 * @returns Inserted `seasons` row.
 */
export async function createSeason(
  db: DrizzleDB,
  overrides: Partial<NewSeason> = {},
): Promise<Season> {
  const plotId = overrides.plotId ?? (await createPlot(db)).id;

  const [season] = await db
    .insert(seasons)
    .values({
      plotId,
      seasonName: "Vụ thử nghiệm",
      startDate: "2026-11-01",
      expectedHarvestDate: "2026-12-20",
      status: SeasonStatus.ACTIVE,
      ...overrides,
    })
    .returning();

  if (!season) {
    throw new Error("Failed to create Season entity in test factory");
  }

  return season;
}

/**
 * Named domain presets for season test fixtures.
 */
export const SeasonMother = {
  /** Season still in initial planning status. */
  planning: (overrides: Partial<NewSeason> = {}): Partial<NewSeason> => ({
    status: SeasonStatus.PLANNING,
    ...overrides,
  }),

  /** Currently active cultivation season. */
  active: (overrides: Partial<NewSeason> = {}): Partial<NewSeason> => ({
    status: SeasonStatus.ACTIVE,
    ...overrides,
  }),

  /** Harvested season awaiting completion. */
  harvested: (overrides: Partial<NewSeason> = {}): Partial<NewSeason> => ({
    status: SeasonStatus.HARVESTED,
    ...overrides,
  }),

  /** Completed terminal historical season. */
  completed: (overrides: Partial<NewSeason> = {}): Partial<NewSeason> => ({
    status: SeasonStatus.COMPLETED,
    ...overrides,
  }),
};

/**
 * Inserts a batch row, provisioning parent season, category, and product when omitted.
 *
 * @param db Drizzle database client.
 * @param overrides Optional column overrides.
 * @returns Inserted `batches` row.
 */
export async function createBatch(
  db: DrizzleDB,
  overrides: Partial<NewBatch> = {},
): Promise<Batch> {
  const seasonId = overrides.seasonId ?? (await createSeason(db)).id;
  const uid = randomUUID().slice(0, 8);

  let productId = overrides.productId;
  if (!productId) {
    const [category] = await db
      .insert(categories)
      .values({
        name: `Danh mục ${uid}`,
        slug: `danh-muc-${uid}`,
      })
      .returning();

    if (!category) {
      throw new Error("Failed to create Category entity in test factory");
    }

    const [product] = await db
      .insert(products)
      .values({
        categoryId: category.id,
        name: `Sản phẩm ${uid}`,
        slug: `san-pham-${uid}`,
        basePrice: 30000,
      })
      .returning();

    if (!product) {
      throw new Error("Failed to create Product entity in test factory");
    }

    productId = product.id;
  }

  const nowMs = Date.now();
  const [batch] = await db
    .insert(batches)
    .values({
      batchCode: `BATCH-${uid.toUpperCase()}`,
      seasonId,
      productId,
      harvestDate: new Date(nowMs - 2 * 24 * 60 * 60 * 1000),
      expirationDate: new Date(nowMs + 5 * 24 * 60 * 60 * 1000),
      initialQuantity: "10.00",
      availableQuantity: "10.00",
      ...overrides,
    })
    .returning();

  if (!batch) {
    throw new Error("Failed to create Batch entity in test factory");
  }

  return batch;
}

/**
 * Named domain presets for batch test fixtures.
 */
export const BatchMother = {
  /** Standard in-stock harvested batch. */
  inStock: (overrides: Partial<NewBatch> = {}): Partial<NewBatch> => {
    const nowMs = Date.now();
    return {
      status: BatchStatus.IN_STOCK,
      harvestDate: new Date(nowMs - 24 * 60 * 60 * 1000),
      expirationDate: new Date(nowMs + 5 * 24 * 60 * 60 * 1000),
      ...overrides,
    };
  },

  /** Near-expiry batch eligible for flash sale (< 48h remaining). */
  nearExpiry: (overrides: Partial<NewBatch> = {}): Partial<NewBatch> => {
    const nowMs = Date.now();
    return {
      status: BatchStatus.NEAR_EXPIRY,
      harvestDate: new Date(nowMs - 48 * 60 * 60 * 1000),
      expirationDate: new Date(nowMs + 24 * 60 * 60 * 1000),
      ...overrides,
    };
  },

  /** Depleted batch still traceable via packaging QR code. */
  soldOut: (overrides: Partial<NewBatch> = {}): Partial<NewBatch> => ({
    status: BatchStatus.SOLD_OUT,
    availableQuantity: "0.00",
    ...overrides,
  }),

  /** Expired batch still traceable via packaging QR code. */
  expired: (overrides: Partial<NewBatch> = {}): Partial<NewBatch> => {
    const nowMs = Date.now();
    return {
      status: BatchStatus.EXPIRED,
      harvestDate: new Date(nowMs - 5 * 24 * 60 * 60 * 1000),
      expirationDate: new Date(nowMs - 24 * 60 * 60 * 1000),
      ...overrides,
    };
  },
};

/**
 * Inserts a minimal harvested batch row linked to a season for testing delete guards.
 *
 * @param db Drizzle database client.
 * @param seasonId Target season UUIDv7.
 * @returns Inserted `batches` row.
 */
export async function createMinimalBatchForSeason(
  db: DrizzleDB,
  seasonId: string,
): Promise<Batch> {
  return createBatch(db, { seasonId });
}

/**
 * Inserts an append-only farming log row, provisioning parent season and staff
 * user automatically when omitted.
 *
 * @param db Drizzle database client.
 * @param overrides Optional column overrides.
 * @returns Inserted `farming_logs` row.
 */
export async function createFarmingLog(
  db: DrizzleDB,
  overrides: Partial<NewFarmingLog> = {},
): Promise<FarmingLog> {
  const seasonId = overrides.seasonId ?? (await createSeason(db)).id;
  const staffId =
    overrides.staffId ??
    (
      await createUser(db, {
        role: UserRole.FARM_STAFF,
      })
    ).id;

  const [log] = await db
    .insert(farmingLogs)
    .values({
      actionType: FarmingActionType.WATERING,
      description: "Tưới nhỏ giọt theo lịch chuẩn VietGAP",
      ...overrides,
      seasonId,
      staffId,
    })
    .returning();

  if (!log) {
    throw new Error("Failed to create FarmingLog entity in test factory");
  }

  return log;
}

/**
 * Named domain presets for cultivation farming log test fixtures.
 */
export const FarmingLogMother = {
  /** Pre-activation soil testing entry. */
  soilTesting: (
    overrides: Partial<NewFarmingLog> = {},
  ): Partial<NewFarmingLog> => ({
    actionType: FarmingActionType.SOIL_TESTING,
    description: "Kiểm tra độ pH và kim loại nặng đầu vụ",
    ...overrides,
  }),

  /** Active cultivation watering entry. */
  watering: (
    overrides: Partial<NewFarmingLog> = {},
  ): Partial<NewFarmingLog> => ({
    actionType: FarmingActionType.WATERING,
    description: "Tưới nhỏ giọt lúc 05:30 sáng",
    ...overrides,
  }),

  /** Correction entry targeting an existing same-season log. */
  correction: (
    correctsLogId: string,
    overrides: Partial<NewFarmingLog> = {},
  ): Partial<NewFarmingLog> => ({
    actionType: FarmingActionType.CORRECTION,
    description: "Đính chính thông số ghi nhận trước đó",
    correctsLogId,
    ...overrides,
  }),
};

/**
 * Inserts a minimal append-only farming log row linked to a season for testing delete guards.
 *
 * @param db Drizzle database client.
 * @param seasonId Target season UUIDv7.
 * @param staffId Optional staff user UUIDv7 (provisioned automatically when omitted).
 * @returns Inserted `farming_logs` row.
 */
export async function createMinimalFarmingLogForSeason(
  db: DrizzleDB,
  seasonId: string,
  staffId?: string,
): Promise<FarmingLog> {
  return createFarmingLog(db, {
    seasonId,
    staffId,
    actionType: FarmingActionType.SOIL_TESTING,
    description: "Kiểm tra đất đầu vụ",
  });
}

import {
  BatchStatus,
  FarmingActionType,
  SeasonStatus,
  WasteLogStatus,
} from "@greenroots/shared";
import type { DrizzleDB } from "@/database/database.module";
import {
  batches,
  categories,
  farmingLogs,
  plots,
  products,
  seasons,
  subscriptionPlans,
  wasteLogs,
} from "@/database/schemas";
import { SEED_IDS } from "../constants/seed-ids.constant";
import { SEED_DATES, SEED_TIMESTAMPS } from "../constants/seed-dates.constant";

interface Tier2Result {
  plots: number;
  seasons: number;
  categories: number;
  products: number;
  batches: number;
  farmingLogs: number;
  wasteLogs: number;
  subscriptionPlans: number;
}

/**
 * Tier 2 - catalog and farm operations: plots, seasons, categories, products,
 * FEFO batches, immutable farming logs, write-offs and subscription plans.
 */
export async function seedTier2Catalog(db: DrizzleDB): Promise<Tier2Result> {
  await db
    .insert(plots)
    .values([
      {
        id: SEED_IDS.plotA1,
        farmId: SEED_IDS.farm,
        plotCode: "PLOT-A1",
        name: "Lô A1 - Nhà kính cà chua",
        areaSqm: "1200.00",
        soilTestResult: {
          ph: 6.4,
          nitrogen_ppm: 42,
          phosphorus_ppm: 28,
          potassium_ppm: 35,
          heavy_metals: { lead_ppm: 0.02, cadmium_ppm: 0.01, pass: true },
          tested_at: "2026-08-20T02:00:00.000Z",
          certificate_url: "https://greenroots.farm/xet-nghiem/dat-a1.pdf",
        },
        waterTestResult: {
          ph: 7.1,
          ec_ms_cm: 0.8,
          dissolved_oxygen_ppm: 6.5,
          e_coli_cfu_100ml: 0,
          heavy_metals_pass: true,
          tested_at: "2026-08-20T02:00:00.000Z",
        },
      },
      {
        id: SEED_IDS.plotB2,
        farmId: SEED_IDS.farm,
        plotCode: "PLOT-B2",
        name: "Lô B2 - Rau ăn lá",
        areaSqm: "800.00",
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(seasons)
    .values([
      {
        id: SEED_IDS.seasonTomato,
        plotId: SEED_IDS.plotA1,
        seasonName: "Vụ Đông Xuân 2026 - Cà Chua Bi",
        startDate: "2026-09-01",
        expectedHarvestDate: "2026-12-15",
        status: SeasonStatus.ACTIVE,
      },
      {
        id: SEED_IDS.seasonSpinach,
        plotId: SEED_IDS.plotB2,
        seasonName: "Vụ Thu Đông 2026 - Cải Bó Xôi",
        startDate: "2026-10-01",
        expectedHarvestDate: "2026-12-01",
        status: SeasonStatus.ACTIVE,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(categories)
    .values([
      {
        id: SEED_IDS.categoryLeafy,
        name: "Rau ăn lá",
        slug: "rau-an-la",
        description: "Các loại rau ăn lá theo mùa",
        sortOrder: 1,
        isActive: true,
      },
      {
        id: SEED_IDS.categoryRoots,
        name: "Rau củ quả",
        slug: "rau-cu-qua",
        description: "Rau củ và trái cây canh tác hữu cơ",
        sortOrder: 2,
        isActive: true,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(categories)
    .values({
      id: SEED_IDS.categoryCherryTomato,
      name: "Cà chua",
      slug: "ca-chua",
      description: "Cà chua bi và cà chua thường",
      parentId: SEED_IDS.categoryRoots,
      sortOrder: 1,
      isActive: true,
    })
    .onConflictDoNothing();

  await db
    .insert(products)
    .values([
      {
        id: SEED_IDS.productCherryTomato,
        categoryId: SEED_IDS.categoryCherryTomato,
        name: "Cà chua bi hữu cơ",
        slug: "ca-chua-bi-huu-co",
        description: "Cà chua bi trồng trong nhà kính, đạt chuẩn VietGAP.",
        basePrice: 45000,
        unit: "kg",
        imageUrls: [
          "https://res.cloudinary.com/greenroots/products/ca-chua-bi.webp",
        ],
        isSubscriptionEligible: true,
        isActive: true,
      },
      {
        id: SEED_IDS.productSpinach,
        categoryId: SEED_IDS.categoryLeafy,
        name: "Cải bó xôi hữu cơ",
        slug: "cai-bo-xoi-huu-co",
        description: "Cải bó xôi non thu hoạch trong ngày.",
        basePrice: 35000,
        unit: "kg",
        imageUrls: [
          "https://res.cloudinary.com/greenroots/products/cai-bo-xoi.webp",
        ],
        isSubscriptionEligible: true,
        isActive: true,
      },
      {
        id: SEED_IDS.productLettuce,
        categoryId: SEED_IDS.categoryLeafy,
        name: "Xà lách Romaine",
        slug: "xa-lach-romaine",
        description: "Xà lách Romaine giòn ngọt, phù hợp salad.",
        basePrice: 40000,
        unit: "kg",
        imageUrls: [
          "https://res.cloudinary.com/greenroots/products/xa-lach-romaine.webp",
        ],
        isSubscriptionEligible: true,
        isActive: true,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(batches)
    .values([
      {
        id: SEED_IDS.batchTomato,
        batchCode: "BATCH-2026-TOM-01",
        seasonId: SEED_IDS.seasonTomato,
        productId: SEED_IDS.productCherryTomato,
        harvestDate: SEED_DATES.tomatoHarvest,
        expirationDate: SEED_DATES.tomatoExpiry,
        initialQuantity: "50.00",
        availableQuantity: "45.00",
        qrCodeUrl: "https://greenroots.farm/trace/BATCH-2026-TOM-01",
        status: BatchStatus.IN_STOCK,
      },
      {
        id: SEED_IDS.batchSpinach,
        batchCode: "BATCH-2026-SPN-01",
        seasonId: SEED_IDS.seasonSpinach,
        productId: SEED_IDS.productSpinach,
        harvestDate: SEED_DATES.spinachHarvest,
        expirationDate: SEED_DATES.spinachExpiry,
        initialQuantity: "30.00",
        availableQuantity: "29.00",
        qrCodeUrl: "https://greenroots.farm/trace/BATCH-2026-SPN-01",
        status: BatchStatus.IN_STOCK,
      },
      {
        id: SEED_IDS.batchLettuce,
        batchCode: "BATCH-2026-LET-01",
        seasonId: SEED_IDS.seasonSpinach,
        productId: SEED_IDS.productLettuce,
        harvestDate: SEED_DATES.lettuceHarvest,
        expirationDate: SEED_DATES.lettuceExpiry,
        initialQuantity: "25.00",
        availableQuantity: "25.00",
        qrCodeUrl: "https://greenroots.farm/trace/BATCH-2026-LET-01",
        status: BatchStatus.IN_STOCK,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(subscriptionPlans)
    .values([
      {
        id: SEED_IDS.planFamily,
        name: "Gói Rau Gia Đình 1 Tháng",
        slug: "goi-rau-gia-dinh-1-thang",
        description: "Gói rau hữu cơ định kỳ dành cho gia đình 3-5 người.",
        price: 1200000,
        totalDeliveries: 8,
        weightPerDeliveryKg: "5.00",
        basketDescription:
          "Mỗi lần giao: 2kg rau ăn lá + 2kg rau củ quả + 1kg rau gia vị theo mùa.",
        isActive: true,
      },
      {
        id: SEED_IDS.planBaby,
        name: "Gói Ăn Dặm Cho Bé",
        slug: "goi-an-dam-cho-be",
        description: "Gói rau củ hữu cơ nghiền nhuyễn phù hợp trẻ ăn dặm.",
        price: 900000,
        totalDeliveries: 8,
        weightPerDeliveryKg: "3.00",
        basketDescription:
          "Mỗi lần giao: 1kg bí đỏ + 1kg cà rốt + 1kg khoai lang theo mùa.",
        isActive: true,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(farmingLogs)
    .values([
      {
        id: SEED_IDS.farmingLogSeeding,
        seasonId: SEED_IDS.seasonTomato,
        staffId: SEED_IDS.farmStaff,
        actionType: FarmingActionType.SEEDING,
        description: "Gieo hạt cà chua bi trong khay ươm tại nhà kính A1.",
        mediaUrls: [
          "https://res.cloudinary.com/greenroots/logs/tomato-seeding-01.webp",
        ],
        loggedAt: SEED_TIMESTAMPS.farmingSeeding,
      },
      {
        id: SEED_IDS.farmingLogHarvest,
        seasonId: SEED_IDS.seasonTomato,
        staffId: SEED_IDS.farmStaff,
        actionType: FarmingActionType.HARVESTING,
        description:
          "Thu hoạch đợt đầu 50kg cà chua bi, phân loại tại kho lạnh.",
        mediaUrls: [
          "https://res.cloudinary.com/greenroots/logs/tomato-harvest-01.webp",
          "https://res.cloudinary.com/greenroots/logs/tomato-harvest-02.webp",
        ],
        loggedAt: SEED_TIMESTAMPS.farmingHarvest,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(wasteLogs)
    .values({
      id: SEED_IDS.wasteLog,
      batchId: SEED_IDS.batchTomato,
      reportedBy: SEED_IDS.farmStaff,
      discardedQuantity: "1.50",
      reason: "Dập nát sau thu hoạch",
      mediaUrls: [
        "https://res.cloudinary.com/greenroots/waste/tomato-waste-01.webp",
      ],
      status: WasteLogStatus.PENDING_APPROVAL,
    })
    .onConflictDoNothing();

  return {
    plots: 2,
    seasons: 2,
    categories: 3,
    products: 3,
    batches: 3,
    farmingLogs: 2,
    wasteLogs: 1,
    subscriptionPlans: 2,
  };
}

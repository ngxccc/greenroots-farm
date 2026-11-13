import {
  BatchStatus,
  DeliveryDay,
  FarmingActionType,
  SeasonStatus,
} from "@greenroots/shared";
import { api } from "@/lib/api-client";
import type {
  BatchTraceRecord,
  StorefrontProduct,
  StorefrontSubscriptionPlan,
} from "@/types/storefront.types";

/**
 * Checks live connectivity to the GreenRoots NestJS API (`/api/v1/health`).
 */
export async function fetchApiHealth(): Promise<{
  reachable: boolean;
  message: string;
}> {
  try {
    const { data } = await api.GET("/api/v1/health");
    if (!data) {
      return {
        reachable: false,
        message: "Máy chủ API tạm thời chưa phản hồi",
      };
    }
    return {
      reachable: true,
      message: data.data.message,
    };
  } catch {
    return {
      reachable: false,
      message: "Chưa kết nối tới máy chủ API",
    };
  }
}

// TODO(catalog-api): Replace showcase items once GET /api/v1/catalog/products is implemented.
const SHOWCASE_PRODUCTS: readonly StorefrontProduct[] = [
  {
    id: "0195a8f0-0001-7000-8000-000000000001",
    slug: "xa-lach-romaine",
    name: "Xà lách Romaine",
    unit: "túi",
    unitLabel: "300g",
    basePriceVnd: 36000,
    salePriceVnd: 18000,
    availableQuantity: 12.5,
    categoryKey: "leaf",
    badgeText: "VietGAP",
    hoursRemaining: 18,
    isRescueDeal: true,
    rescueBatchProgressPct: 75,
    isSubscriptionEligible: true,
  },
  {
    id: "0195a8f0-0002-7000-8000-000000000002",
    slug: "ca-chua-bi-huu-co",
    name: "Cà chua bi",
    unit: "hộp",
    unitLabel: "500g",
    basePriceVnd: 56000,
    salePriceVnd: 28000,
    availableQuantity: 18.5,
    categoryKey: "fruit",
    badgeText: "Cắt 4h sáng",
    hoursRemaining: 26,
    isRescueDeal: true,
    rescueBatchProgressPct: 63,
    isSubscriptionEligible: true,
  },
  {
    id: "0195a8f0-0003-7000-8000-000000000003",
    slug: "cai-ngot-baby",
    name: "Cải ngọt baby",
    unit: "bó",
    unitLabel: "500g",
    basePriceVnd: 30000,
    salePriceVnd: 15000,
    availableQuantity: 9,
    categoryKey: "leaf",
    badgeText: "VietGAP",
    hoursRemaining: 30,
    isRescueDeal: true,
    rescueBatchProgressPct: 82,
    isSubscriptionEligible: true,
  },
  {
    id: "0195a8f0-0004-7000-8000-000000000004",
    slug: "dua-leo-baby",
    name: "Dưa leo baby",
    unit: "túi",
    unitLabel: "500g",
    basePriceVnd: 34000,
    salePriceVnd: 17000,
    availableQuantity: 14,
    categoryKey: "fruit",
    badgeText: "Cắt 4h sáng",
    hoursRemaining: 40,
    isRescueDeal: true,
    rescueBatchProgressPct: 58,
    isSubscriptionEligible: true,
  },
  {
    id: "0195a8f0-0005-7000-8000-000000000005",
    slug: "rau-muong-huu-co",
    name: "Rau muống hữu cơ",
    unit: "bó",
    unitLabel: "bó 500g",
    basePriceVnd: 18000,
    availableQuantity: 25,
    categoryKey: "leaf",
    badgeText: "Cắt 4h sáng",
    isRescueDeal: false,
    isSubscriptionEligible: true,
  },
  {
    id: "0195a8f0-0006-7000-8000-000000000006",
    slug: "cai-bo-xoi",
    name: "Cải bó xôi",
    unit: "bó",
    unitLabel: "bó 300g",
    basePriceVnd: 32000,
    availableQuantity: 11,
    categoryKey: "leaf",
    badgeText: "VietGAP",
    isRescueDeal: false,
    isSubscriptionEligible: true,
  },
  {
    id: "0195a8f0-0007-7000-8000-000000000007",
    slug: "ca-rot-huu-co",
    name: "Cà rốt hữu cơ",
    unit: "kg",
    unitLabel: "1 kg",
    basePriceVnd: 38000,
    availableQuantity: 30,
    categoryKey: "fruit",
    badgeText: "VietGAP",
    isRescueDeal: false,
    isSubscriptionEligible: true,
  },
  {
    id: "0195a8f0-0008-7000-8000-000000000008",
    slug: "bi-do-ho-lo",
    name: "Bí đỏ hồ lô",
    unit: "kg",
    unitLabel: "1 kg",
    basePriceVnd: 34000,
    availableQuantity: 22,
    categoryKey: "fruit",
    badgeText: "Cắt 4h sáng",
    isRescueDeal: false,
    isSubscriptionEligible: false,
  },
  {
    id: "0195a8f0-0009-7000-8000-000000000009",
    slug: "hanh-la-huu-co",
    name: "Hành lá",
    unit: "bó",
    unitLabel: "bó 100g",
    basePriceVnd: 12000,
    availableQuantity: 16,
    categoryKey: "spice",
    badgeText: "VietGAP",
    isRescueDeal: false,
    isSubscriptionEligible: true,
  },
  {
    id: "0195a8f0-0010-7000-8000-000000000010",
    slug: "nam-bao-ngu",
    name: "Nấm bào ngư",
    unit: "túi",
    unitLabel: "300g",
    basePriceVnd: 35000,
    availableQuantity: 8,
    categoryKey: "spice",
    badgeText: "Cắt 4h sáng",
    isRescueDeal: false,
    isSubscriptionEligible: false,
  },
  {
    id: "0195a8f0-0011-7000-8000-000000000011",
    slug: "ot-sung-do",
    name: "Ớt sừng đỏ",
    unit: "túi",
    unitLabel: "200g",
    basePriceVnd: 15000,
    availableQuantity: 6.5,
    categoryKey: "spice",
    badgeText: "VietGAP",
    isRescueDeal: false,
    isSubscriptionEligible: true,
  },
];

// TODO(catalog-api): Replace showcase plans once GET /api/v1/catalog/subscription-plans lands.
const SHOWCASE_PLANS: readonly StorefrontSubscriptionPlan[] = [
  {
    id: "plan-family-5kg",
    slug: "goi-rau-gia-dinh-1-thang",
    name: "Gói Gia Đình 5kg",
    description:
      "Giỏ rau mùa vụ cho 4–5 người, thu hoạch sáng sớm Thứ 3 hoặc Thứ 6 hàng tuần.",
    priceVnd: 1200000,
    weightPerDeliveryKg: 5,
    totalDeliveries: 8,
    supportedDeliveryDays: [
      DeliveryDay.TUESDAY,
      DeliveryDay.FRIDAY,
      DeliveryDay.BOTH,
    ],
  },
  {
    id: "plan-baby-2kg",
    slug: "goi-rau-an-dam-2kg",
    name: "Gói Ăn Dặm 2kg",
    description:
      "Rau củ mềm, đạt chuẩn dư lượng bằng 0 dành riêng cho bé ăn dặm.",
    priceVnd: 550000,
    weightPerDeliveryKg: 2,
    totalDeliveries: 8,
    supportedDeliveryDays: [DeliveryDay.TUESDAY, DeliveryDay.FRIDAY],
  },
];

// TODO(farms-api): Wire GET /api/v1/farms/trace/:batchCode once FarmsModule controller lands.
const SHOWCASE_TRACE_RECORDS: Record<string, BatchTraceRecord> = {
  "BATCH-2026-TOM-01": {
    batchCode: "BATCH-2026-TOM-01",
    productName: "Cà chua bi hữu cơ",
    unitLabel: "500g",
    harvestDate: "2026-11-10",
    expirationDate: "2026-11-19",
    status: BatchStatus.IN_STOCK,
    plotCode: "PLOT-A1",
    plotName: "Lô A1 - Nhà kính cà chua",
    areaSqm: 1200,
    seasonName: "Vụ Đông Xuân 2026 - Cà Chua Bi",
    seasonStatus: SeasonStatus.ACTIVE,
    soilPh: 6.4,
    waterPh: 7.1,
    heavyMetalsPass: true,
    certificationUrl: "https://greenroots.farm/xet-nghiem/dat-a1.pdf",
    farmingLogs: [
      {
        id: "log-1",
        actionType: FarmingActionType.SEEDING,
        description:
          "Xuống giống cà chua bi hữu cơ F1 trên giá thể xơ dừa đã xử lý vi sinh.",
        mediaUrls: [],
        loggedAt: "2026-09-01T01:30:00.000Z",
        engineerName: "Kỹ sư Lê Văn Canh Tác",
      },
      {
        id: "log-2",
        actionType: FarmingActionType.BIO_FERTILIZING,
        description:
          "Bón thúc phân trùn quế kết hợp dịch chuối ủ men vi sinh định kỳ tuần 4.",
        mediaUrls: [],
        loggedAt: "2026-10-02T02:15:00.000Z",
        engineerName: "Kỹ sư Lê Văn Canh Tác",
      },
      {
        id: "log-3",
        actionType: FarmingActionType.HARVESTING,
        description:
          "Thu hoạch thủ công lúc 4h sáng đạt độ chín 90%, đóng khay thông thoáng tại vườn.",
        mediaUrls: [],
        loggedAt: "2026-11-10T21:00:00.000Z",
        engineerName: "Kỹ sư Lê Văn Canh Tác",
      },
    ],
  },
};

export function getShowcaseCatalog(): {
  products: readonly StorefrontProduct[];
  plans: readonly StorefrontSubscriptionPlan[];
} {
  return {
    products: SHOWCASE_PRODUCTS,
    plans: SHOWCASE_PLANS,
  };
}

export function getShowcaseProductBySlug(
  slug: string,
): StorefrontProduct | undefined {
  return SHOWCASE_PRODUCTS.find((item) => item.slug === slug);
}

export function getShowcaseTraceByCode(
  batchCode: string,
): BatchTraceRecord | undefined {
  const normalized = batchCode.trim().toUpperCase();
  return SHOWCASE_TRACE_RECORDS[normalized];
}

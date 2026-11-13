import type {
  BatchStatus,
  DeliveryDay,
  FarmingActionType,
  SeasonStatus,
} from "@greenroots/shared";

export type CategoryShelfKey = "rescue" | "leaf" | "fruit" | "spice";

export interface StorefrontProduct {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly unit: string;
  readonly unitLabel: string;
  readonly basePriceVnd: number;
  readonly salePriceVnd?: number;
  readonly availableQuantity: number;
  readonly categoryKey: Exclude<CategoryShelfKey, "rescue">;
  readonly badgeText: string;
  readonly imageUrl?: string;
  readonly hoursRemaining?: number;
  readonly isRescueDeal: boolean;
  readonly rescueBatchProgressPct?: number;
  readonly isSubscriptionEligible: boolean;
}

export interface StorefrontSubscriptionPlan {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly priceVnd: number;
  readonly weightPerDeliveryKg: number;
  readonly totalDeliveries: number;
  readonly supportedDeliveryDays: readonly DeliveryDay[];
}

export interface FarmingLogEntry {
  readonly id: string;
  readonly actionType: FarmingActionType;
  readonly description: string;
  readonly mediaUrls: readonly string[];
  readonly loggedAt: string;
  readonly engineerName: string;
}

export interface BatchTraceRecord {
  readonly batchCode: string;
  readonly productName: string;
  readonly unitLabel: string;
  readonly harvestDate: string;
  readonly expirationDate: string;
  readonly status: BatchStatus;
  readonly plotCode: string;
  readonly plotName: string;
  readonly areaSqm: number;
  readonly seasonName: string;
  readonly seasonStatus: SeasonStatus;
  readonly soilPh: number;
  readonly waterPh: number;
  readonly heavyMetalsPass: boolean;
  readonly certificationUrl: string;
  readonly farmingLogs: readonly FarmingLogEntry[];
}

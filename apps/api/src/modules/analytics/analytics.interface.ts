import type { AnalyticsGranularity } from "./analytics.constant";

/**
 * Resolved inclusive date window and half-open UTC bounds for `Asia/Ho_Chi_Minh`.
 */
export interface ResolvedAnalyticsWindow {
  readonly from: string;
  readonly to: string;
  readonly granularity: AnalyticsGranularity;
  readonly topLimit: number;
  readonly windowStartUtc: Date;
  readonly windowEndExclusiveUtc: Date;
}

/**
 * Aggregated revenue bucket row returned from PostgreSQL.
 */
export interface RevenueBucketAggregate {
  readonly bucket: string;
  readonly grossItemRevenueVnd: number;
  readonly deliveredOrderCount: number;
}

/**
 * Aggregated cohort waste bucket row returned from PostgreSQL.
 */
export interface WasteBucketAggregate {
  readonly bucket: string;
  readonly initialQuantity: number;
  readonly discardedQuantity: number;
}

/**
 * Resolved inclusive date window and half-open UTC bounds for financial cashflow analytics.
 */
export type ResolvedFinanceAnalyticsWindow = Omit<
  ResolvedAnalyticsWindow,
  "topLimit"
>;

/**
 * Aggregated cashflow bucket row returned from PostgreSQL (`payments.paid_at`).
 */
export interface FinanceCashflowBucketAggregate {
  readonly bucket: string;
  readonly payosInflowVnd: number;
  readonly payosOutflowVnd: number;
  readonly codInflowVnd: number;
  readonly codOutflowVnd: number;
}

/**
 * PayOS inflow breakdown between order checkouts and prepaid subscriptions.
 */
export interface PayosSourceBreakdown {
  readonly payosOrderInflowVnd: number;
  readonly payosSubscriptionInflowVnd: number;
}

import { WasteLogStatus } from "@greenroots/shared";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import {
  DATABASE_CONNECTION,
  type DrizzleDB,
} from "@/database/database.module";
import {
  batches,
  orderItems,
  orders,
  products,
  wasteLogs,
} from "@/database/schemas";
import {
  ANALYTICS_DEFAULT_RANGE_DAYS,
  ANALYTICS_REVENUE_ORDER_STATUSES,
  ANALYTICS_TIMEZONE,
  type AnalyticsGranularity,
} from "./analytics.constant";
import type {
  ResolvedAnalyticsWindow,
  RevenueBucketAggregate,
  WasteBucketAggregate,
} from "./analytics.interface";
import {
  addDaysToIsoDate,
  computeWasteRatio,
  generateContiguousBuckets,
  getTodayInHoChiMinh,
  hoChiMinhStartOfDayUtc,
  roundQuantity2dp,
} from "./analytics.util";
import type { OperationsAnalytics, OperationsAnalyticsQuery } from "./dto";

/**
 * Read-only operational analytics service (`ADR-0048`).
 *
 * Computes `grossItemRevenueVnd` anchored on `orders.delivered_at`, harvest-cohort
 * `wasteRatio` over `batches.harvest_date`, and `topProducts` without joining `payments`.
 */
@Injectable()
export class AnalyticsService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDB) {}

  /**
   * Aggregates operational revenue, cohort waste ratio, and top products for `[from, to]`.
   *
   * @param query Validated analytics query parameters.
   * @returns Zero-filled operational analytics payload in `Asia/Ho_Chi_Minh`.
   */
  async getOperationsAnalytics(
    query: OperationsAnalyticsQuery,
  ): Promise<OperationsAnalytics> {
    const window = this.resolveWindow(query);

    const [revenueRows, wasteRows, topProductRows] = await Promise.all([
      this.queryRevenueBuckets(window),
      this.queryWasteBuckets(window),
      this.queryTopProducts(window),
    ]);

    const buckets = generateContiguousBuckets(
      window.from,
      window.to,
      window.granularity,
    );

    const revenueByBucket = new Map(
      revenueRows.map((row) => [row.bucket, row]),
    );
    const wasteByBucket = new Map(wasteRows.map((row) => [row.bucket, row]));

    let grossItemRevenueVnd = 0;
    let deliveredOrderCount = 0;
    const revenueSeries = buckets.map((bucket) => {
      const row = revenueByBucket.get(bucket);
      const revenue = row?.grossItemRevenueVnd ?? 0;
      const count = row?.deliveredOrderCount ?? 0;
      grossItemRevenueVnd += revenue;
      deliveredOrderCount += count;
      return {
        bucket,
        grossItemRevenueVnd: revenue,
        deliveredOrderCount: count,
      };
    });

    let rawInitialTotal = 0;
    let rawDiscardedTotal = 0;
    const wasteSeries = buckets.map((bucket) => {
      const row = wasteByBucket.get(bucket);
      const rawInitial = row?.initialQuantity ?? 0;
      const rawDiscarded = row?.discardedQuantity ?? 0;
      rawInitialTotal += rawInitial;
      rawDiscardedTotal += rawDiscarded;

      const initialQuantity = roundQuantity2dp(rawInitial);
      const discardedQuantity = roundQuantity2dp(rawDiscarded);
      return {
        bucket,
        initialQuantity,
        discardedQuantity,
        wasteRatio: computeWasteRatio(rawDiscarded, rawInitial),
      };
    });

    const totalInitialQuantity = roundQuantity2dp(rawInitialTotal);
    const totalDiscardedQuantity = roundQuantity2dp(rawDiscardedTotal);

    return {
      period: {
        from: window.from,
        to: window.to,
        granularity: window.granularity,
        timezone: ANALYTICS_TIMEZONE,
      },
      summary: {
        grossItemRevenueVnd,
        deliveredOrderCount,
        totalInitialQuantity,
        totalDiscardedQuantity,
        wasteRatio: computeWasteRatio(rawDiscardedTotal, rawInitialTotal),
      },
      revenueSeries,
      wasteSeries,
      topProducts: topProductRows,
    };
  }

  private resolveWindow(
    query: OperationsAnalyticsQuery,
  ): ResolvedAnalyticsWindow {
    const to = query.to ?? getTodayInHoChiMinh();
    const from =
      query.from ?? addDaysToIsoDate(to, -(ANALYTICS_DEFAULT_RANGE_DAYS - 1));

    return {
      from,
      to,
      granularity: query.granularity,
      topLimit: query.topLimit,
      windowStartUtc: hoChiMinhStartOfDayUtc(from),
      windowEndExclusiveUtc: hoChiMinhStartOfDayUtc(addDaysToIsoDate(to, 1)),
    };
  }

  private buildBucketExpression(
    column: typeof orders.deliveredAt | typeof batches.harvestDate,
    granularity: AnalyticsGranularity,
  ) {
    // Inline the constant timezone literal so SELECT and GROUP BY emit identical SQL nodes.
    const tz = sql.raw(`'${ANALYTICS_TIMEZONE}'`);
    if (granularity === "day") {
      return sql<string>`to_char(${column} AT TIME ZONE ${tz}, 'YYYY-MM-DD')`;
    }
    if (granularity === "week") {
      return sql<string>`to_char(date_trunc('week', ${column} AT TIME ZONE ${tz}), 'YYYY-MM-DD')`;
    }
    return sql<string>`to_char(${column} AT TIME ZONE ${tz}, 'YYYY-MM')`;
  }

  private buildGrossItemRevenueExpression() {
    return sql<number>`COALESCE(SUM(ROUND(${orderItems.quantity} * ${orderItems.unitPrice})), 0)::bigint`;
  }

  private async queryRevenueBuckets(
    window: ResolvedAnalyticsWindow,
  ): Promise<RevenueBucketAggregate[]> {
    const bucketExpr = this.buildBucketExpression(
      orders.deliveredAt,
      window.granularity,
    );

    const rows = await this.db
      .select({
        bucket: bucketExpr,
        grossItemRevenueVnd: this.buildGrossItemRevenueExpression(),
        deliveredOrderCount: sql<number>`COUNT(DISTINCT ${orders.id})::integer`,
      })
      .from(orders)
      .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
      .where(
        and(
          inArray(orders.orderStatus, [...ANALYTICS_REVENUE_ORDER_STATUSES]),
          gte(orders.deliveredAt, window.windowStartUtc),
          lt(orders.deliveredAt, window.windowEndExclusiveUtc),
        ),
      )
      .groupBy(bucketExpr)
      .orderBy(bucketExpr);

    return rows.map((row) => ({
      bucket: row.bucket,
      grossItemRevenueVnd: Number(row.grossItemRevenueVnd),
      deliveredOrderCount: Number(row.deliveredOrderCount),
    }));
  }

  private async queryWasteBuckets(
    window: ResolvedAnalyticsWindow,
  ): Promise<WasteBucketAggregate[]> {
    const bucketExpr = this.buildBucketExpression(
      batches.harvestDate,
      window.granularity,
    );

    // Pre-aggregate approved waste logs per batch so batches with multiple write-offs do not duplicate initialQuantity.
    const approvedWasteSubquery = this.db
      .select({
        batchId: wasteLogs.batchId,
        discardedQuantity: sql<string>`SUM(${wasteLogs.discardedQuantity})`.as(
          "discarded_quantity",
        ),
      })
      .from(wasteLogs)
      .where(eq(wasteLogs.status, WasteLogStatus.APPROVED))
      .groupBy(wasteLogs.batchId)
      .as("approved_waste");

    const rows = await this.db
      .select({
        bucket: bucketExpr,
        initialQuantity: sql<number>`COALESCE(SUM(${batches.initialQuantity}), 0)::double precision`,
        discardedQuantity: sql<number>`COALESCE(SUM(COALESCE(${approvedWasteSubquery.discardedQuantity}, 0)), 0)::double precision`,
      })
      .from(batches)
      .leftJoin(
        approvedWasteSubquery,
        eq(approvedWasteSubquery.batchId, batches.id),
      )
      .where(
        and(
          gte(batches.harvestDate, window.windowStartUtc),
          lt(batches.harvestDate, window.windowEndExclusiveUtc),
        ),
      )
      .groupBy(bucketExpr)
      .orderBy(bucketExpr);

    return rows.map((row) => ({
      bucket: row.bucket,
      initialQuantity: Number(row.initialQuantity),
      discardedQuantity: Number(row.discardedQuantity),
    }));
  }

  private async queryTopProducts(window: ResolvedAnalyticsWindow) {
    const grossRevenueExpr = this.buildGrossItemRevenueExpression();
    const totalQuantityExpr = sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)::double precision`;

    const rows = await this.db
      .select({
        productId: products.id,
        productName: products.name,
        unit: products.unit,
        totalQuantity: totalQuantityExpr,
        grossItemRevenueVnd: grossRevenueExpr,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .innerJoin(products, eq(products.id, orderItems.productId))
      .where(
        and(
          inArray(orders.orderStatus, [...ANALYTICS_REVENUE_ORDER_STATUSES]),
          gte(orders.deliveredAt, window.windowStartUtc),
          lt(orders.deliveredAt, window.windowEndExclusiveUtc),
        ),
      )
      .groupBy(products.id, products.name, products.unit)
      .orderBy(desc(grossRevenueExpr), desc(totalQuantityExpr), products.id)
      .limit(window.topLimit);

    return rows.map((row) => ({
      productId: row.productId,
      productName: row.productName,
      unit: row.unit,
      totalQuantity: roundQuantity2dp(Number(row.totalQuantity)),
      grossItemRevenueVnd: Number(row.grossItemRevenueVnd),
    }));
  }
}

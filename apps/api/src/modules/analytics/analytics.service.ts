import {
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
  WasteLogStatus,
} from "@greenroots/shared";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import {
  DATABASE_CONNECTION,
  type DrizzleDB,
} from "@/database/database.module";
import {
  batches,
  orderItems,
  orders,
  payments,
  products,
  wasteLogs,
} from "@/database/schemas";
import {
  ANALYTICS_DEFAULT_RANGE_DAYS,
  ANALYTICS_FINANCE_PAYMENT_METHODS,
  ANALYTICS_PENDING_COD_ORDER_STATUSES,
  ANALYTICS_REVENUE_ORDER_STATUSES,
  ANALYTICS_TIMEZONE,
  type AnalyticsGranularity,
} from "./analytics.constant";
import type {
  FinanceCashflowBucketAggregate,
  PayosSourceBreakdown,
  ResolvedAnalyticsWindow,
  ResolvedFinanceAnalyticsWindow,
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
import type {
  FinanceAnalytics,
  FinanceAnalyticsQuery,
  OperationsAnalytics,
  OperationsAnalyticsQuery,
} from "./dto";

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

  /**
   * Aggregates cash-basis PayOS vs. COD cashflow anchored on `payments.paid_at`
   * alongside a live `pendingCodReceivableVnd` snapshot (`ADR-0049`).
   *
   * @param query Validated financial analytics query parameters.
   * @returns Zero-filled financial cashflow payload in `Asia/Ho_Chi_Minh`.
   */
  async getFinanceAnalytics(
    query: FinanceAnalyticsQuery,
  ): Promise<FinanceAnalytics> {
    const window = this.resolveBaseWindow(query);

    const [cashflowRows, payosBreakdown, pendingCodReceivableVnd] =
      await Promise.all([
        this.queryCashflowBuckets(window),
        this.queryPayosSourceBreakdown(window),
        this.queryPendingCodReceivableVnd(),
      ]);

    const buckets = generateContiguousBuckets(
      window.from,
      window.to,
      window.granularity,
    );
    const cashflowByBucket = new Map(
      cashflowRows.map((row) => [row.bucket, row]),
    );

    let payosInflowVnd = 0;
    let payosOutflowVnd = 0;
    let codInflowVnd = 0;
    let codOutflowVnd = 0;

    const cashflowSeries = buckets.map((bucket) => {
      const row = cashflowByBucket.get(bucket);
      const bucketPayosInflow = row?.payosInflowVnd ?? 0;
      const bucketPayosOutflow = row?.payosOutflowVnd ?? 0;
      const bucketCodInflow = row?.codInflowVnd ?? 0;
      const bucketCodOutflow = row?.codOutflowVnd ?? 0;

      payosInflowVnd += bucketPayosInflow;
      payosOutflowVnd += bucketPayosOutflow;
      codInflowVnd += bucketCodInflow;
      codOutflowVnd += bucketCodOutflow;

      const payosNetVnd = bucketPayosInflow - bucketPayosOutflow;
      const codNetVnd = bucketCodInflow - bucketCodOutflow;

      return {
        bucket,
        payosInflowVnd: bucketPayosInflow,
        payosOutflowVnd: bucketPayosOutflow,
        payosNetVnd,
        codInflowVnd: bucketCodInflow,
        codOutflowVnd: bucketCodOutflow,
        codNetVnd,
        netCashflowVnd: payosNetVnd + codNetVnd,
      };
    });

    const payosNetVnd = payosInflowVnd - payosOutflowVnd;
    const codNetVnd = codInflowVnd - codOutflowVnd;

    return {
      period: {
        from: window.from,
        to: window.to,
        granularity: window.granularity,
        timezone: ANALYTICS_TIMEZONE,
      },
      summary: {
        payosInflowVnd,
        payosOrderInflowVnd: payosBreakdown.payosOrderInflowVnd,
        payosSubscriptionInflowVnd: payosBreakdown.payosSubscriptionInflowVnd,
        payosOutflowVnd,
        payosNetVnd,
        codInflowVnd,
        codOutflowVnd,
        codNetVnd,
        totalInflowVnd: payosInflowVnd + codInflowVnd,
        totalOutflowVnd: payosOutflowVnd + codOutflowVnd,
        netCashflowVnd: payosNetVnd + codNetVnd,
        pendingCodReceivableVnd,
      },
      cashflowSeries,
    };
  }

  private resolveBaseWindow(query: {
    from?: string;
    to?: string;
    granularity: AnalyticsGranularity;
  }): ResolvedFinanceAnalyticsWindow {
    const to = query.to ?? getTodayInHoChiMinh();
    const from =
      query.from ?? addDaysToIsoDate(to, -(ANALYTICS_DEFAULT_RANGE_DAYS - 1));

    return {
      from,
      to,
      granularity: query.granularity,
      windowStartUtc: hoChiMinhStartOfDayUtc(from),
      windowEndExclusiveUtc: hoChiMinhStartOfDayUtc(addDaysToIsoDate(to, 1)),
    };
  }

  private resolveWindow(
    query: OperationsAnalyticsQuery,
  ): ResolvedAnalyticsWindow {
    return {
      ...this.resolveBaseWindow(query),
      topLimit: query.topLimit,
    };
  }

  private buildBucketExpression(
    column:
      | typeof orders.deliveredAt
      | typeof batches.harvestDate
      | typeof payments.paidAt,
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

  private async queryCashflowBuckets(
    window: ResolvedFinanceAnalyticsWindow,
  ): Promise<FinanceCashflowBucketAggregate[]> {
    const bucketExpr = this.buildBucketExpression(
      payments.paidAt,
      window.granularity,
    );

    const rows = await this.db
      .select({
        bucket: bucketExpr,
        payosInflowVnd: sql<number>`COALESCE(SUM(CASE WHEN ${payments.paymentMethod} = ${PaymentMethod.PAYOS} AND ${payments.transactionType} = ${PaymentTransactionType.PAYMENT} AND ${payments.status} = ${PaymentStatus.PAID} THEN ${payments.amount} ELSE 0 END), 0)::bigint`,
        payosOutflowVnd: sql<number>`COALESCE(SUM(CASE WHEN ${payments.paymentMethod} = ${PaymentMethod.PAYOS} AND ${payments.transactionType} = ${PaymentTransactionType.REFUND} AND ${payments.status} = ${PaymentStatus.REFUNDED} THEN ${payments.amount} ELSE 0 END), 0)::bigint`,
        codInflowVnd: sql<number>`COALESCE(SUM(CASE WHEN ${payments.paymentMethod} = ${PaymentMethod.COD} AND ${payments.transactionType} = ${PaymentTransactionType.PAYMENT} AND ${payments.status} = ${PaymentStatus.PAID} THEN ${payments.amount} ELSE 0 END), 0)::bigint`,
        codOutflowVnd: sql<number>`COALESCE(SUM(CASE WHEN ${payments.paymentMethod} = ${PaymentMethod.COD} AND ${payments.transactionType} = ${PaymentTransactionType.REFUND} AND ${payments.status} = ${PaymentStatus.REFUNDED} THEN ${payments.amount} ELSE 0 END), 0)::bigint`,
      })
      .from(payments)
      .where(
        and(
          inArray(payments.paymentMethod, [
            ...ANALYTICS_FINANCE_PAYMENT_METHODS,
          ]),
          gte(payments.paidAt, window.windowStartUtc),
          lt(payments.paidAt, window.windowEndExclusiveUtc),
          or(
            and(
              eq(payments.transactionType, PaymentTransactionType.PAYMENT),
              eq(payments.status, PaymentStatus.PAID),
            ),
            and(
              eq(payments.transactionType, PaymentTransactionType.REFUND),
              eq(payments.status, PaymentStatus.REFUNDED),
            ),
          ),
        ),
      )
      .groupBy(bucketExpr)
      .orderBy(bucketExpr);

    return rows.map((row) => ({
      bucket: row.bucket,
      payosInflowVnd: Number(row.payosInflowVnd),
      payosOutflowVnd: Number(row.payosOutflowVnd),
      codInflowVnd: Number(row.codInflowVnd),
      codOutflowVnd: Number(row.codOutflowVnd),
    }));
  }

  private async queryPayosSourceBreakdown(
    window: ResolvedFinanceAnalyticsWindow,
  ): Promise<PayosSourceBreakdown> {
    const [row] = await this.db
      .select({
        payosOrderInflowVnd: sql<number>`COALESCE(SUM(CASE WHEN ${payments.orderId} IS NOT NULL THEN ${payments.amount} ELSE 0 END), 0)::bigint`,
        payosSubscriptionInflowVnd: sql<number>`COALESCE(SUM(CASE WHEN ${payments.subscriptionId} IS NOT NULL THEN ${payments.amount} ELSE 0 END), 0)::bigint`,
      })
      .from(payments)
      .where(
        and(
          eq(payments.paymentMethod, PaymentMethod.PAYOS),
          eq(payments.transactionType, PaymentTransactionType.PAYMENT),
          eq(payments.status, PaymentStatus.PAID),
          gte(payments.paidAt, window.windowStartUtc),
          lt(payments.paidAt, window.windowEndExclusiveUtc),
        ),
      );

    return {
      payosOrderInflowVnd: Number(row?.payosOrderInflowVnd ?? 0),
      payosSubscriptionInflowVnd: Number(row?.payosSubscriptionInflowVnd ?? 0),
    };
  }

  private async queryPendingCodReceivableVnd(): Promise<number> {
    const [row] = await this.db
      .select({
        pendingCodReceivableVnd: sql<number>`COALESCE(SUM(${payments.amount}), 0)::bigint`,
      })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .where(
        and(
          eq(payments.paymentMethod, PaymentMethod.COD),
          eq(payments.status, PaymentStatus.PENDING),
          eq(payments.transactionType, PaymentTransactionType.PAYMENT),
          inArray(orders.orderStatus, [
            ...ANALYTICS_PENDING_COD_ORDER_STATUSES,
          ]),
        ),
      );

    return Number(row?.pendingCodReceivableVnd ?? 0);
  }
}

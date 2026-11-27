import {
  ConflictException,
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  API_ERROR_CODES,
  BatchStatus,
  BUSINESS_RULES,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
  UserStatus,
  type ProductImageUrls,
} from "@greenroots/shared";
import { env } from "@/common/config/env.config";
import { PG_ERROR_CODE } from "@/common/constants/error.constant";
import { MESSAGES } from "@/common/constants/messages.constant";
import { TIME_IN_MS } from "@/common/constants/time.constant";
import type { PaginationMetaDto } from "@/common/dto/api-response.dto";
import { buildPaginationMeta } from "@/common/utils/api-response.util";
import { extractDatabaseErrorDetails } from "@/common/utils/error.util";
import {
  DATABASE_CONNECTION,
  type DrizzleDB,
  type DrizzleTx,
} from "@/database/database.module";
import {
  batchAllocations,
  batches,
  categories,
  orderItems,
  orders,
  payments,
  products,
  users,
} from "@/database/schemas";
import { LIVE_AVAILABLE_QUANTITY_EXPR } from "@/modules/catalog/products.service";
import { FarmSettingsService } from "@/modules/farms/farm-settings.service";
import {
  PAYMENT_DRIVER_TOKEN,
  PAYMENT_ORDER_CODE_UIDX,
} from "@/modules/payments/payments.constant";
import {
  cancelPaymentLinksBestEffort,
  generatePayosOrderCode,
  type PayosLinkCancelTarget,
} from "@/modules/payments/payos.util";
import type { PaymentDriver } from "@/modules/payments/payments.interface";
import { AddressService } from "@/modules/users/address.service";
import type {
  BatchAllocationSummaryProjection,
  CheckoutRequestInput,
  ListMyOrdersQuery,
  OrderItemProjection,
  OrderPickListProjection,
  OrderProjection,
  PickListBatchItemProjection,
  StaffOrderItemProjection,
  StaffOrderProjection,
  ValidateCartRequestInput,
  ValidateCartResponse,
  ValidatedCartItem,
} from "./dto";
import {
  applyFefoAllocations,
  buildOrderCode,
  formatOrderCalendarDateVn,
  formatQuantityFromCents,
  isOrderCodeUniqueViolation,
  lockCandidateSellableBatches,
  planFefoAllocations,
  queryCandidateSellableBatches,
  resolveBatchUnitPriceVnd,
  toQuantityCents,
  type FefoAllocationPlan,
  type PlannedBatchAllocation,
} from "./fefo-allocation.util";
import {
  ALLOCATED_CANCELLABLE_STATUSES,
  EXPIRY_SWEEP_BATCH_SIZE,
  ORDER_CODE_MAX_GENERATION_ATTEMPTS,
  ORDER_ITEM_MAX_QUANTITY,
  ORDER_STATUS_TRANSITIONS,
  PICK_LIST_ALLOWED_STATUSES,
  type CartItemIssue,
  type OrderSortOption,
  type PickListOrderStatus,
} from "./orders.constant";
import type { NormalizedCartItem } from "./orders.interface";
import type { ShippingQuote } from "./shipping/dto";
import { ShippingService } from "./shipping/shipping.service";

const ORDER_COLUMNS = {
  id: orders.id,
  customerId: orders.customerId,
  orderCode: orders.orderCode,
  orderStatus: orders.orderStatus,
  paymentMethod: orders.paymentMethod,
  paymentStatus: orders.paymentStatus,
  reservationExpiresAt: orders.reservationExpiresAt,
  receiverName: orders.receiverName,
  receiverPhone: orders.receiverPhone,
  shippingAddress: orders.shippingAddress,
  shippingDistanceKm: orders.shippingDistanceKm,
  shippingFee: orders.shippingFee,
  subtotal: orders.subtotal,
  discountAmount: orders.discountAmount,
  loyaltyPointsUsed: orders.loyaltyPointsUsed,
  totalAmount: orders.totalAmount,
  createdAt: orders.createdAt,
  updatedAt: orders.updatedAt,
} as const;

type OrderRow = Pick<typeof orders.$inferSelect, keyof typeof ORDER_COLUMNS>;

interface OrderItemWithProductRow {
  readonly id: string;
  readonly orderId: string;
  readonly productId: string;
  readonly quantity: string;
  readonly unitPrice: number;
  readonly productName: string;
  readonly productSlug: string;
  readonly productImageUrls: ProductImageUrls | null;
  readonly unit: string;
}

const ORDER_SORT_EXPRESSIONS = new Map<OrderSortOption, SQL[]>([
  ["createdAt:desc", [desc(orders.createdAt), desc(orders.id)]],
  ["createdAt:asc", [asc(orders.createdAt), desc(orders.id)]],
  ["totalAmount:desc", [desc(orders.totalAmount), desc(orders.id)]],
  ["totalAmount:asc", [asc(orders.totalAmount), desc(orders.id)]],
]);

interface CatalogProductStockRow {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly imageUrls: ProductImageUrls | null;
  readonly unit: string;
  readonly basePrice: number;
  readonly salePrice: number | null;
  readonly isActive: boolean;
  readonly deletedAt: Date | null;
  readonly categoryIsActive: boolean;
  readonly categoryDeletedAt: Date | null;
  readonly availableQuantity: string | number;
}

interface EvaluatedCartItem {
  readonly normalized: NormalizedCartItem;
  readonly row: CatalogProductStockRow | undefined;
  readonly isSellableSku: boolean;
  readonly availableQuantity: number;
  readonly availableCents: number;
  readonly unitPriceVnd: number;
  readonly lineTotalVnd: number;
  readonly isAvailable: boolean;
  readonly issue: CartItemIssue | null;
}

interface ComputedOrderTotals {
  readonly subtotalVnd: number;
  readonly loyaltyPointsUsed: number;
  readonly discountAmountVnd: number;
  readonly totalAmountVnd: number;
}

/**
 * Orchestrates diagnostic cart validation and atomic COD checkout transactions
 * with server-authoritative catalog pricing, MOV enforcement, shipping quotes,
 * and serialized loyalty-point deductions (`ADR-0031`).
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DrizzleDB,
    private readonly addressService: AddressService,
    private readonly shippingService: ShippingService,
    private readonly farmSettingsService: FarmSettingsService,
    @Inject(PAYMENT_DRIVER_TOKEN)
    private readonly paymentDriver: PaymentDriver,
  ) {}

  /**
   * Lists the authenticated customer's orders with pagination, status filtering,
   * and deterministic sorting, excluding internal allocation and payment gateway fields (`ADR-0032`).
   *
   * @param sub Authenticated customer UUID from JWT `sub`.
   * @param query Validated pagination, status filter, and sort options.
   * @returns Closed `OrderProjection` page and pagination metadata.
   */
  async listMyOrders(
    sub: string,
    query: ListMyOrdersQuery,
  ): Promise<{ items: OrderProjection[]; meta: PaginationMetaDto }> {
    await this.loadActiveCustomer(this.db, sub, false);

    const statusFilter = query.statuses
      ? inArray(orders.orderStatus, query.statuses)
      : query.status
        ? eq(orders.orderStatus, query.status)
        : undefined;

    const whereClause = statusFilter
      ? and(eq(orders.customerId, sub), statusFilter)
      : eq(orders.customerId, sub);

    const [countRow] = await this.db
      .select({ total: count() })
      .from(orders)
      .where(whereClause);

    const total = Number(countRow?.total ?? 0);
    const meta = buildPaginationMeta(total, query.page, query.limit);
    const offset = (query.page - 1) * query.limit;

    if (total === 0 || offset >= total) {
      return { items: [], meta };
    }

    const orderByClause = ORDER_SORT_EXPRESSIONS.get(query.sort) ?? [
      desc(orders.createdAt),
      desc(orders.id),
    ];

    const orderRows = await this.db
      .select(ORDER_COLUMNS)
      .from(orders)
      .where(whereClause)
      .orderBy(...orderByClause)
      .limit(query.limit)
      .offset(offset);

    if (orderRows.length === 0) {
      return { items: [], meta };
    }

    const itemsByOrderId = await this.hydrateOrderItemsByOrderIds(
      orderRows.map((row) => row.id),
    );
    const paymentUrlsByOrderId =
      await this.hydratePendingPaymentUrls(orderRows);

    return {
      items: orderRows.map((row) =>
        this.mapOrderRowToProjection(
          row,
          itemsByOrderId.get(row.id) ?? [],
          paymentUrlsByOrderId.get(row.id) ?? null,
        ),
      ),
      meta,
    };
  }

  /**
   * Retrieves a single owned customer order with line items and totals (`ADR-0032`).
   * Throws `404 ORDER_NOT_FOUND` for both unknown IDs and orders owned by another customer.
   *
   * @param sub Authenticated customer UUID from JWT `sub`.
   * @param orderId Target order UUIDv7 identifier.
   * @returns Closed `OrderProjection` including line items and monetary totals.
   */
  async getMyOrderById(sub: string, orderId: string): Promise<OrderProjection> {
    await this.loadActiveCustomer(this.db, sub, false);

    const [orderRow] = await this.db
      .select(ORDER_COLUMNS)
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.customerId, sub)))
      .limit(1);

    if (!orderRow) {
      throw new NotFoundException({
        code: API_ERROR_CODES.ORDER_NOT_FOUND,
        detail: MESSAGES.ORDERS.NOT_FOUND,
      });
    }

    let resolvedOrderRow = orderRow;
    if (
      resolvedOrderRow.orderStatus === OrderStatus.PENDING_PAYMENT &&
      resolvedOrderRow.paymentMethod === PaymentMethod.PAYOS
    ) {
      resolvedOrderRow =
        await this.reconcilePendingPayosOrder(resolvedOrderRow);
    }

    const itemsByOrderId = await this.hydrateOrderItemsByOrderIds([
      resolvedOrderRow.id,
    ]);
    const paymentUrlsByOrderId = await this.hydratePendingPaymentUrls([
      resolvedOrderRow,
    ]);

    return this.mapOrderRowToProjection(
      resolvedOrderRow,
      itemsByOrderId.get(resolvedOrderRow.id) ?? [],
      paymentUrlsByOrderId.get(resolvedOrderRow.id) ?? null,
    );
  }

  /**
   * Actively reconciles a `pending_payment` PayOS order against `GET /v2/payment-requests/{orderCode}`
   * so local dev environments (without public HTTPS webhooks) and delayed webhook deliveries settle or cancel immediately.
   * Fails open on gateway lookup errors so order reads never break.
   */
  private async reconcilePendingPayosOrder(
    orderRow: OrderRow,
  ): Promise<OrderRow> {
    const [pendingPayment] = await this.db
      .select({
        id: payments.id,
        orderCode: payments.orderCode,
        amount: payments.amount,
      })
      .from(payments)
      .where(
        and(
          eq(payments.orderId, orderRow.id),
          eq(payments.status, PaymentStatus.PENDING),
          eq(payments.transactionType, PaymentTransactionType.PAYMENT),
        ),
      )
      .limit(1);

    if (!pendingPayment?.orderCode) {
      return orderRow;
    }

    let info;
    try {
      info = await this.paymentDriver.getPaymentLinkInfo(
        pendingPayment.orderCode,
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown error";
      this.logger.warn(
        `Active PayOS status check failed for orderId=${orderRow.id} orderCode=${pendingPayment.orderCode}: ${detail}`,
      );
      return orderRow;
    }

    const normalizedStatus = info.status.toUpperCase();
    const now = new Date();

    if (
      normalizedStatus === "PAID" &&
      info.amountPaidVnd >= pendingPayment.amount
    ) {
      const settledOrder = await this.db.transaction(async (tx) => {
        const lockedOrder = await this.lockOrderForUpdate(tx, orderRow.id);
        if (lockedOrder.orderStatus !== OrderStatus.PENDING_PAYMENT) {
          return lockedOrder;
        }

        const [lockedPayment] = await tx
          .select({
            id: payments.id,
            status: payments.status,
          })
          .from(payments)
          .where(eq(payments.id, pendingPayment.id))
          .for("update");

        if (!lockedPayment || lockedPayment.status === PaymentStatus.PAID) {
          return lockedOrder;
        }

        const firstTx = info.transactions[0];
        const reference =
          firstTx && typeof firstTx["reference"] === "string"
            ? firstTx["reference"]
            : null;

        await tx
          .update(payments)
          .set({
            status: PaymentStatus.PAID,
            referenceCode: reference ?? (info.paymentLinkId || null),
            rawPayload:
              info.rawPayload as (typeof payments.$inferInsert)["rawPayload"],
            paidAt: now,
            updatedAt: now,
          })
          .where(eq(payments.id, lockedPayment.id));

        const [updatedOrder] = await tx
          .update(orders)
          .set({
            paymentStatus: PaymentStatus.PAID,
            orderStatus: OrderStatus.CONFIRMED,
            reservationExpiresAt: null,
            updatedAt: now,
          })
          .where(eq(orders.id, lockedOrder.id))
          .returning(ORDER_COLUMNS);

        return updatedOrder ?? lockedOrder;
      });

      return settledOrder;
    }

    if (normalizedStatus === "CANCELLED") {
      const hoursThreshold = await this.resolveHoursThreshold();
      const cancelledOrder = await this.db.transaction(async (tx) => {
        const lockedOrder = await this.lockOrderForUpdate(tx, orderRow.id);
        if (lockedOrder.orderStatus !== OrderStatus.PENDING_PAYMENT) {
          return lockedOrder;
        }

        const { cancelledOrder: updatedOrder } = await this.cancelOrderWithinTx(
          tx,
          lockedOrder,
          hoursThreshold,
          now,
          PaymentStatus.CANCELLED,
        );
        return updatedOrder;
      });

      return cancelledOrder;
    }

    return orderRow;
  }

  /**
   * Cancels an owned retail order prior to staff confirmation (`ADR-0038`, `INV-ORD-21`).
   * Throws `404 ORDER_NOT_FOUND` on missing or non-owned orders (`ADR-0032` anti-enumeration),
   * `422 ORDER_PAID_CANCELLATION_FORBIDDEN` for paid/subscription orders, and
   * `422 ORDER_INVALID_STATUS_TRANSITION` once the order reaches `confirmed` or later.
   *
   * @param sub Authenticated customer UUID from JWT `sub`.
   * @param orderId Target order UUIDv7 identifier.
   * @returns Closed `OrderProjection` without internal allocation fields.
   */
  async cancelMyOrder(sub: string, orderId: string): Promise<OrderProjection> {
    const hoursThreshold = await this.resolveHoursThreshold();

    const { projection, cancelledPayosOrderCode } = await this.db.transaction(
      async (tx) => {
        const orderRow = await this.lockOrderForUpdate(tx, orderId);

        if (orderRow.customerId !== sub) {
          throw new NotFoundException({
            code: API_ERROR_CODES.ORDER_NOT_FOUND,
            detail: MESSAGES.ORDERS.NOT_FOUND,
          });
        }

        this.assertOrderCancellablePayment(orderRow);

        if (
          orderRow.orderStatus !== OrderStatus.PENDING_PAYMENT &&
          orderRow.orderStatus !== OrderStatus.PENDING_CONFIRMATION
        ) {
          throw new UnprocessableEntityException({
            code: API_ERROR_CODES.ORDER_INVALID_STATUS_TRANSITION,
            detail: MESSAGES.ORDERS.INVALID_STATUS_TRANSITION,
          });
        }

        const { cancelledOrder, cancelledPayosOrderCode } =
          await this.cancelOrderWithinTx(
            tx,
            orderRow,
            hoursThreshold,
            new Date(),
          );

        const itemRows = await this.fetchOrderItemsWithProduct(tx, [
          cancelledOrder.id,
        ]);

        return {
          projection: this.mapOrderRowToProjection(
            cancelledOrder,
            itemRows.map((row) => this.mapOrderItemProjection(row)),
          ),
          cancelledPayosOrderCode,
        };
      },
    );

    if (cancelledPayosOrderCode !== null) {
      await cancelPaymentLinksBestEffort(
        this.paymentDriver,
        this.logger,
        [{ orderCode: cancelledPayosOrderCode, referenceId: orderId }],
        "Customer cancelled order",
      );
    }

    return projection;
  }

  /**
   * Confirms a `pending_confirmation` order that already holds checkout-time FEFO allocations (`ADR-0038`).
   * Naturally idempotent when the order is already `confirmed` (returns active allocations without mutating stock).
   *
   * @param orderId Target order UUIDv7 identifier.
   * @returns Staff order projection including active FEFO batch allocations.
   */
  async confirmOrder(orderId: string): Promise<StaffOrderProjection> {
    return this.db.transaction(async (tx) => {
      const orderRow = await this.lockOrderForUpdate(tx, orderId);

      if (orderRow.orderStatus === OrderStatus.CONFIRMED) {
        return this.hydrateStaffOrderProjection(tx, orderRow, "active");
      }

      if (orderRow.orderStatus !== OrderStatus.PENDING_CONFIRMATION) {
        throw new ConflictException({
          code: API_ERROR_CODES.ORDER_INVALID_STATUS_TRANSITION,
          detail: MESSAGES.ORDERS.INVALID_STATUS_TRANSITION,
        });
      }

      const [activeAllocation] = await tx
        .select({ id: batchAllocations.id })
        .from(batchAllocations)
        .innerJoin(orderItems, eq(batchAllocations.orderItemId, orderItems.id))
        .where(
          and(
            eq(orderItems.orderId, orderRow.id),
            isNull(batchAllocations.releasedAt),
          ),
        )
        .limit(1);

      if (!activeAllocation) {
        throw new ConflictException({
          code: API_ERROR_CODES.ORDER_INVALID_STATUS_TRANSITION,
          detail: MESSAGES.ORDERS.ACTIVE_ALLOCATIONS_MISSING,
        });
      }

      const now = new Date();
      const [updatedOrder] = await tx
        .update(orders)
        .set({
          orderStatus: OrderStatus.CONFIRMED,
          reservationExpiresAt: null,
          updatedAt: now,
        })
        .where(eq(orders.id, orderRow.id))
        .returning(ORDER_COLUMNS);

      if (!updatedOrder) {
        throw new Error("Failed to update confirmed order status.");
      }

      return this.hydrateStaffOrderProjection(tx, updatedOrder, "active");
    });
  }

  /**
   * Advances or cancels an order strictly along the 8-state `OrderStatus` FSM (`ADR-0033`).
   * Cancelling an allocated order soft-releases `batch_allocations`, restores batch stock/status,
   * cancels pending COD payments, and refunds `loyaltyPointsUsed`.
   *
   * @param orderId Target order UUIDv7 identifier.
   * @param targetStatus Desired next `OrderStatus`.
   * @returns Staff order projection with active or soft-released batch allocations.
   */
  async updateOrderStatus(
    orderId: string,
    targetStatus: OrderStatus,
  ): Promise<StaffOrderProjection> {
    const hoursThreshold =
      targetStatus === OrderStatus.CANCELLED
        ? await this.resolveHoursThreshold()
        : null;

    const { projection, cancelledPayosOrderCode } = await this.db.transaction(
      async (tx) => {
        const orderRow = await this.lockOrderForUpdate(tx, orderId);
        const allowedNext =
          ORDER_STATUS_TRANSITIONS.get(orderRow.orderStatus) ?? [];

        if (!allowedNext.includes(targetStatus)) {
          throw new UnprocessableEntityException({
            code: API_ERROR_CODES.ORDER_INVALID_STATUS_TRANSITION,
            detail: MESSAGES.ORDERS.INVALID_STATUS_TRANSITION,
          });
        }

        if (
          targetStatus === OrderStatus.COMPLETED &&
          orderRow.paymentStatus !== PaymentStatus.PAID
        ) {
          throw new UnprocessableEntityException({
            code: API_ERROR_CODES.ORDER_PAYMENT_REQUIRED,
            detail: MESSAGES.ORDERS.PAYMENT_REQUIRED,
          });
        }

        const now = new Date();

        if (targetStatus === OrderStatus.CANCELLED) {
          const { cancelledOrder, cancelledPayosOrderCode } =
            await this.cancelOrderWithinTx(
              tx,
              orderRow,
              hoursThreshold ?? BUSINESS_RULES.FLASH_SALE_HOURS_THRESHOLD,
              now,
            );

          return {
            projection: await this.hydrateStaffOrderProjection(
              tx,
              cancelledOrder,
              "released",
            ),
            cancelledPayosOrderCode,
          };
        }

        const [updatedOrder] = await tx
          .update(orders)
          .set({
            orderStatus: targetStatus,
            ...(targetStatus === OrderStatus.DELIVERED
              ? { deliveredAt: now }
              : {}),
            updatedAt: now,
          })
          .where(eq(orders.id, orderRow.id))
          .returning(ORDER_COLUMNS);

        if (!updatedOrder) {
          throw new Error("Failed to update order status.");
        }

        return {
          projection: await this.hydrateStaffOrderProjection(
            tx,
            updatedOrder,
            "active",
          ),
          cancelledPayosOrderCode: null,
        };
      },
    );

    if (cancelledPayosOrderCode !== null) {
      await cancelPaymentLinksBestEffort(
        this.paymentDriver,
        this.logger,
        [{ orderCode: cancelledPayosOrderCode, referenceId: orderId }],
        "Staff cancelled order",
      );
    }

    return projection;
  }

  /**
   * Cancels up to `EXPIRY_SWEEP_BATCH_SIZE` expired `pending_payment` / `pending_confirmation`
   * reservations (`INV-ORD-22`), soft-releasing batch allocations and refunding loyalty points,
   * then cancels active PayOS links post-commit (`INV-EXP-1`, `INV-EXP-2`).
   *
   * @param now Reference timestamp for expiration comparison.
   * @returns Number of expired orders cancelled in this sweep batch.
   */
  async expireStaleReservations(now: Date = new Date()): Promise<number> {
    const hoursThreshold = await this.resolveHoursThreshold();
    let expiredCount = 0;
    const cancelledPayosTargets: PayosLinkCancelTarget[] = [];

    // Claim and cancel one expired order per short transaction so lock order strictly stays orders -> batches (id ASC) -> users across the batch.
    for (let i = 0; i < EXPIRY_SWEEP_BATCH_SIZE; i += 1) {
      const result = await this.db.transaction(async (tx) => {
        const [orderRow] = await tx
          .select(ORDER_COLUMNS)
          .from(orders)
          .where(
            and(
              inArray(orders.orderStatus, [
                OrderStatus.PENDING_PAYMENT,
                OrderStatus.PENDING_CONFIRMATION,
              ]),
              isNotNull(orders.reservationExpiresAt),
              lte(orders.reservationExpiresAt, now),
            ),
          )
          .orderBy(asc(orders.reservationExpiresAt), asc(orders.id))
          .limit(1)
          .for("update", { skipLocked: true });

        if (!orderRow) {
          return null;
        }

        const { cancelledPayosOrderCode } = await this.cancelOrderWithinTx(
          tx,
          orderRow,
          hoursThreshold,
          now,
        );
        return {
          orderId: orderRow.id,
          cancelledPayosOrderCode,
        };
      });

      if (!result) {
        break;
      }

      expiredCount += 1;
      if (result.cancelledPayosOrderCode !== null) {
        cancelledPayosTargets.push({
          orderCode: result.cancelledPayosOrderCode,
          referenceId: result.orderId,
        });
      }
    }

    await cancelPaymentLinksBestEffort(
      this.paymentDriver,
      this.logger,
      cancelledPayosTargets,
      "Order reservation expired",
    );

    return expiredCount;
  }

  /**
   * Returns a read-only FEFO batch-grouped pick list for an order in `confirmed`, `packing`, or `shipping` status (`#87`).
   * Reads `orders` and active `batch_allocations` (`released_at IS NULL`) in a single statement snapshot without mutating stock.
   *
   * @param orderId Target order UUIDv7 identifier.
   * @returns Closed `OrderPickListProjection` grouped by `batchId` in FEFO order.
   */
  async getOrderPickList(orderId: string): Promise<OrderPickListProjection> {
    // Evaluate order status and active allocations in one READ COMMITTED statement to avoid TOCTOU races with concurrent cancellation.
    // Join products without deletedAt/isActive filters so confirmed orders remain pickable even after catalog archival (ADR-0032).
    const rows = await this.db
      .select({
        orderId: orders.id,
        orderCode: orders.orderCode,
        orderStatus: orders.orderStatus,
        allocationId: batchAllocations.id,
        allocatedQuantity: batchAllocations.allocatedQuantity,
        batchId: batches.id,
        batchCode: batches.batchCode,
        expirationDate: batches.expirationDate,
        batchStatus: batches.status,
        productId: products.id,
        productName: products.name,
        unit: products.unit,
      })
      .from(orders)
      .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
      .leftJoin(
        batchAllocations,
        and(
          eq(batchAllocations.orderItemId, orderItems.id),
          isNull(batchAllocations.releasedAt),
        ),
      )
      .leftJoin(batches, eq(batches.id, batchAllocations.batchId))
      .leftJoin(products, eq(products.id, batches.productId))
      .where(eq(orders.id, orderId))
      .orderBy(
        asc(batches.expirationDate),
        asc(batches.id),
        asc(batchAllocations.id),
      );

    const header = rows[0];
    if (!header) {
      throw new NotFoundException({
        code: API_ERROR_CODES.ORDER_NOT_FOUND,
        detail: MESSAGES.ORDERS.NOT_FOUND,
      });
    }

    if (!this.isPickListOrderStatus(header.orderStatus)) {
      throw new ConflictException({
        code: API_ERROR_CODES.ORDER_PICK_LIST_STATUS_INVALID,
        detail: MESSAGES.ORDERS.PICK_LIST_STATUS_INVALID,
      });
    }

    const now = new Date();
    const nowMs = now.getTime();
    const groupedBatches = new Map<
      string,
      {
        readonly batchId: string;
        readonly batchCode: string;
        readonly expirationDate: Date;
        readonly batchStatus: BatchStatus;
        readonly productId: string;
        readonly productName: string;
        readonly unit: string;
        allocatedCents: number;
      }
    >();

    for (const row of rows) {
      if (
        !row.allocationId ||
        !row.batchId ||
        !row.batchCode ||
        !row.expirationDate ||
        !row.batchStatus ||
        !row.productId ||
        !row.productName ||
        !row.unit ||
        row.allocatedQuantity === null
      ) {
        continue;
      }

      const deltaCents = toQuantityCents(row.allocatedQuantity);
      const existing = groupedBatches.get(row.batchId);
      if (existing) {
        existing.allocatedCents += deltaCents;
      } else {
        groupedBatches.set(row.batchId, {
          batchId: row.batchId,
          batchCode: row.batchCode,
          expirationDate: row.expirationDate,
          batchStatus: row.batchStatus,
          productId: row.productId,
          productName: row.productName,
          unit: row.unit,
          allocatedCents: deltaCents,
        });
      }
    }

    if (groupedBatches.size === 0) {
      throw new ConflictException({
        code: API_ERROR_CODES.ORDER_ACTIVE_ALLOCATIONS_MISSING,
        detail: MESSAGES.ORDERS.ACTIVE_ALLOCATIONS_MISSING,
      });
    }

    const pickListBatches: PickListBatchItemProjection[] = Array.from(
      groupedBatches.values(),
    ).map((entry) => ({
      batchId: entry.batchId,
      batchCode: entry.batchCode,
      expirationDate: entry.expirationDate.toISOString(),
      batchStatus: entry.batchStatus,
      isExpired: entry.expirationDate.getTime() <= nowMs,
      productId: entry.productId,
      productName: entry.productName,
      unit: entry.unit,
      allocatedQuantity: entry.allocatedCents / 100,
    }));

    return {
      orderId: header.orderId,
      orderCode: header.orderCode,
      orderStatus: header.orderStatus,
      generatedAt: now.toISOString(),
      batches: pickListBatches,
    };
  }

  /**
   * Validates cart items, live sellable stock, delivery quote, loyalty cap,
   * and minimum order value without mutating persisted state.
   *
   * @param sub Authenticated customer UUID from JWT `sub`.
   * @param input Validated cart validation payload.
   * @returns Non-throwing `200` diagnostic cart validation summary.
   */
  async validateCart(
    sub: string,
    input: ValidateCartRequestInput,
  ): Promise<ValidateCartResponse> {
    const normalizedItems = this.normalizeCartItems(input.items);
    const activeCustomer = await this.loadActiveCustomer(this.db, sub, false);
    const shipping = await this.resolveCartValidationShipping(sub, input);
    const productRows = await this.loadCatalogProductsWithStock(
      this.db,
      normalizedItems.map((item) => item.productId),
    );
    const baseEvaluated = this.evaluateCartItems(normalizedItems, productRows);
    const availableInputs = baseEvaluated
      .filter((item) => item.isAvailable)
      .map((item) => ({
        productId: item.normalized.productId,
        quantityCents: item.normalized.quantityCents,
      }));
    let evaluated = baseEvaluated;
    if (availableInputs.length > 0) {
      const candidateBatches = await queryCandidateSellableBatches(
        this.db,
        availableInputs.map((item) => item.productId),
        new Date(),
      );
      const fefoOutcome = planFefoAllocations(
        availableInputs,
        candidateBatches,
      );
      const plannedAllocations = fefoOutcome.ok
        ? fefoOutcome.plan.allocations
        : fefoOutcome.allocations;
      evaluated = this.splitEvaluatedItemsByFefoPricing(
        baseEvaluated,
        plannedAllocations,
      );
    }

    const totals = this.computeOrderTotals({
      evaluated,
      requestedLoyaltyPoints: input.loyaltyPoints,
      availableRewardPoints: activeCustomer.rewardPoints,
      shippingFeeVnd: shipping?.feeVnd ?? 0,
      clientTotalVnd: input.clientTotalVnd,
    });

    const items: ValidatedCartItem[] = evaluated.map((item) => {
      const visibleRow = item.row?.deletedAt === null ? item.row : undefined;
      return {
        productId: item.normalized.productId,
        name: visibleRow?.name ?? null,
        slug: visibleRow?.slug ?? null,
        unit: visibleRow?.unit ?? null,
        requestedQuantity: item.normalized.quantity,
        availableQuantity: item.availableQuantity,
        unitPriceVnd: item.unitPriceVnd,
        lineTotalVnd: item.lineTotalVnd,
        isAvailable: item.isAvailable,
        issue: item.issue,
      };
    });

    const meetsMinOrderValue =
      totals.subtotalVnd >= BUSINESS_RULES.MIN_ORDER_VALUE_VND;
    const allItemsAvailable = items.every((item) => item.isAvailable);
    const isDeliverable = shipping?.isDeliverable ?? false;

    return {
      isValid: allItemsAvailable && meetsMinOrderValue && isDeliverable,
      meetsMinOrderValue,
      minOrderValueVnd: BUSINESS_RULES.MIN_ORDER_VALUE_VND,
      items,
      subtotalVnd: totals.subtotalVnd,
      shipping,
      requestedLoyaltyPoints: input.loyaltyPoints,
      appliedLoyaltyPoints: totals.loyaltyPointsUsed,
      availableLoyaltyPoints: activeCustomer.rewardPoints,
      discountAmountVnd: totals.discountAmountVnd,
      totalAmountVnd: totals.totalAmountVnd,
    };
  }

  /**
   * Executes retail checkout for COD or PayOS (`ADR-0031`, `ADR-0038`, `ADR-0042`).
   *
   * @param sub Authenticated customer UUID from JWT `sub`.
   * @param input Validated checkout payload.
   * @returns Closed `OrderProjection` (with `paymentUrl` populated for PayOS).
   */
  async checkout(
    sub: string,
    input: CheckoutRequestInput,
  ): Promise<OrderProjection> {
    if (input.paymentMethod === PaymentMethod.PAYOS) {
      return this.checkoutPayos(sub, input);
    }
    return this.checkoutCod(sub, input);
  }

  /**
   * Executes an atomic COD checkout transaction with server-authoritative pricing,
   * MOV enforcement, delivery radius check, serialized loyalty deduction, and
   * paired `payments` ledger creation.
   *
   * @param sub Authenticated customer UUID from JWT `sub`.
   * @param input Validated COD checkout payload.
   * @returns Closed `OrderProjection` created in `PENDING_CONFIRMATION`.
   */
  async checkoutCod(
    sub: string,
    input: Omit<CheckoutRequestInput, "paymentMethod"> & {
      paymentMethod?: CheckoutRequestInput["paymentMethod"];
    },
  ): Promise<OrderProjection> {
    const normalizedInput: CheckoutRequestInput = {
      ...input,
      paymentMethod: PaymentMethod.COD,
    };
    const context = await this.prepareCheckoutContext(
      sub,
      normalizedInput,
      PaymentMethod.COD,
    );
    const result = await this.runCheckoutReservationWithRetry(
      sub,
      normalizedInput,
      context,
      PaymentMethod.COD,
    );
    return result.projection;
  }

  /**
   * Executes two-phase PayOS checkout (`ADR-0042`):
   * TX1 reserves FEFO stock and inserts `PENDING_PAYMENT` order/payment,
   * `PaymentDriver.createPaymentLink` runs outside any DB transaction, and
   * TX2 persists `paymentUrl` (or compensating cancellation marks `FAILED` and throws `502`).
   */
  private async checkoutPayos(
    sub: string,
    input: CheckoutRequestInput,
  ): Promise<OrderProjection> {
    const context = await this.prepareCheckoutContext(
      sub,
      input,
      PaymentMethod.PAYOS,
    );
    const tx1 = await this.runCheckoutReservationWithRetry(
      sub,
      input,
      context,
      PaymentMethod.PAYOS,
    );

    const storefrontOrigin = env.STOREFRONT_URL;
    const returnUrl = `${storefrontOrigin}/orders/${tx1.projection.id}?payment=success`;
    const cancelUrl = `${storefrontOrigin}/orders/${tx1.projection.id}?payment=cancelled`;
    const expiredAt = Math.floor(tx1.reservationExpiresAt.getTime() / 1000);

    try {
      const link = await this.paymentDriver.createPaymentLink({
        orderCode: tx1.paymentOrderCode!,
        amountVnd: tx1.projection.totalAmountVnd,
        description: tx1.projection.orderCode,
        returnUrl,
        cancelUrl,
        expiredAt,
      });

      await this.db
        .update(payments)
        .set({
          paymentUrl: link.checkoutUrl,
          updatedAt: new Date(),
        })
        .where(eq(payments.id, tx1.paymentId));

      return {
        ...tx1.projection,
        paymentUrl: link.checkoutUrl,
      };
    } catch (error) {
      this.logger.error(
        `PayOS createPaymentLink failed for orderId=${tx1.projection.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.compensateFailedPayosCheckout(tx1.projection.id);
      throw new BadGatewayException({
        code: API_ERROR_CODES.PAYMENT_GATEWAY_ERROR,
        detail: MESSAGES.PAYMENTS.GATEWAY_ERROR,
      });
    }
  }

  private async compensateFailedPayosCheckout(orderId: string): Promise<void> {
    const hoursThreshold = await this.resolveHoursThreshold();
    await this.db.transaction(async (tx) => {
      const orderRow = await this.lockOrderForUpdate(tx, orderId);
      if (orderRow.orderStatus === OrderStatus.CANCELLED) {
        return;
      }
      await this.cancelOrderWithinTx(
        tx,
        orderRow,
        hoursThreshold,
        new Date(),
        PaymentStatus.FAILED,
      );
    });
  }

  private async prepareCheckoutContext(
    sub: string,
    input: CheckoutRequestInput,
    paymentMethod: typeof PaymentMethod.COD | typeof PaymentMethod.PAYOS,
  ) {
    const normalizedItems = this.normalizeCartItems(input.items);

    const settings = await this.farmSettingsService.getSettings();
    if (paymentMethod === PaymentMethod.PAYOS && !settings.isPayosEnabled) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.ORDER_PAYOS_DISABLED,
        detail: MESSAGES.ORDERS.PAYOS_DISABLED,
      });
    }
    if (paymentMethod === PaymentMethod.COD && !settings.isCodEnabled) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.ORDER_COD_DISABLED,
        detail: MESSAGES.ORDERS.COD_DISABLED,
      });
    }

    const resolvedAddress = await this.addressService.resolveAddressForQuote(
      sub,
      input.addressId,
    );
    const shippingQuote = await this.shippingService.quoteForCoordinates(
      {
        latitude: resolvedAddress.latitude,
        longitude: resolvedAddress.longitude,
      },
      { isSubscription: false },
    );

    if (!shippingQuote.isDeliverable || shippingQuote.feeVnd === null) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.OUT_OF_DELIVERY_RADIUS,
        detail: MESSAGES.ORDERS.OUT_OF_DELIVERY_RADIUS,
        invalidParams: [
          {
            name: "addressId",
            code: API_ERROR_CODES.OUT_OF_DELIVERY_RADIUS,
            reason: MESSAGES.ORDERS.OUT_OF_DELIVERY_RADIUS,
            params: {
              maxRadiusKm: shippingQuote.maxRadiusKm,
              roadDistanceKm: shippingQuote.roadDistanceKm,
            },
          },
        ],
      });
    }

    return {
      normalizedItems,
      shippingFeeVnd: shippingQuote.feeVnd,
      receiverName: resolvedAddress.receiverName,
      receiverPhone: resolvedAddress.phoneNumber,
      shippingAddress: resolvedAddress.formattedAddress,
      shippingDistanceKm: shippingQuote.roadDistanceKm,
      shippingDistanceKmStr: shippingQuote.roadDistanceKm.toFixed(2),
      yyyymmdd: formatOrderCalendarDateVn(new Date()),
    };
  }

  private async runCheckoutReservationWithRetry(
    sub: string,
    input: CheckoutRequestInput,
    context: {
      readonly normalizedItems: readonly NormalizedCartItem[];
      readonly shippingFeeVnd: number;
      readonly receiverName: string;
      readonly receiverPhone: string;
      readonly shippingAddress: string;
      readonly shippingDistanceKm: number;
      readonly shippingDistanceKmStr: string;
      readonly yyyymmdd: string;
    },
    paymentMethod: typeof PaymentMethod.COD | typeof PaymentMethod.PAYOS,
  ) {
    for (
      let attempt = 1;
      attempt <= ORDER_CODE_MAX_GENERATION_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await this.executeCheckoutTransaction(sub, input, {
          ...context,
          paymentMethod,
        });
      } catch (error) {
        if (
          isOrderCodeUniqueViolation(error) ||
          (paymentMethod === PaymentMethod.PAYOS &&
            this.isPaymentOrderCodeUniqueViolation(error))
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new ConflictException({
      code: API_ERROR_CODES.CONFLICT_RECORD,
      detail:
        paymentMethod === PaymentMethod.PAYOS
          ? MESSAGES.PAYMENTS.ORDER_CODE_GENERATION_EXHAUSTED
          : MESSAGES.ORDERS.CODE_GENERATION_EXHAUSTED,
    });
  }

  private async executeCheckoutTransaction(
    sub: string,
    input: CheckoutRequestInput,
    params: {
      readonly normalizedItems: readonly NormalizedCartItem[];
      readonly shippingFeeVnd: number;
      readonly receiverName: string;
      readonly receiverPhone: string;
      readonly shippingAddress: string;
      readonly shippingDistanceKm: number;
      readonly shippingDistanceKmStr: string;
      readonly yyyymmdd: string;
      readonly paymentMethod:
        | typeof PaymentMethod.COD
        | typeof PaymentMethod.PAYOS;
    },
  ): Promise<{
    projection: OrderProjection;
    paymentId: string;
    paymentOrderCode: number | null;
    reservationExpiresAt: Date;
  }> {
    // Fail fast on missing or suspended customer before opening a DB transaction or taking row locks.
    await this.loadActiveCustomer(this.db, sub, false);

    return this.db.transaction(async (tx) => {
      const now = new Date();
      const productIds = params.normalizedItems.map((item) => item.productId);
      const productRows = await this.loadCatalogProductsWithStock(
        tx,
        productIds,
      );
      const baseEvaluated = this.evaluateCartItems(
        params.normalizedItems,
        productRows,
      );

      this.assertCheckoutItemsValid(baseEvaluated);

      // Enforce global lock order `batches (id ASC) -> users` to prevent deadlocks with cancel/expiry sweeps (`INV-ORD-19`).
      const candidateBatches = await lockCandidateSellableBatches(
        tx,
        productIds,
        now,
      );
      const fefoPlan = this.planFefoAllocations(
        params.normalizedItems,
        candidateBatches,
      );
      const evaluated = this.splitEvaluatedItemsByFefoPricing(
        baseEvaluated,
        fefoPlan.allocations,
      );

      const subtotalVnd = evaluated.reduce(
        (sum, item) => sum + item.lineTotalVnd,
        0,
      );
      if (subtotalVnd < BUSINESS_RULES.MIN_ORDER_VALUE_VND) {
        throw new UnprocessableEntityException({
          code: API_ERROR_CODES.ORDER_BELOW_MINIMUM_VALUE,
          detail: MESSAGES.ORDERS.BELOW_MINIMUM_VALUE,
          invalidParams: [
            {
              name: "items",
              code: API_ERROR_CODES.ORDER_BELOW_MINIMUM_VALUE,
              reason: MESSAGES.ORDERS.BELOW_MINIMUM_VALUE,
              params: {
                minOrderValueVnd: BUSINESS_RULES.MIN_ORDER_VALUE_VND,
                currentSubtotalVnd: subtotalVnd,
              },
            },
          ],
        });
      }

      // Lock customer unconditionally (even when loyaltyPoints === 0) to serialize pending order cap checks (`INV-ORD-20`).
      const lockedCustomer = await this.loadActiveCustomer(tx, sub, true);

      const isPayos = params.paymentMethod === PaymentMethod.PAYOS;
      const pendingStatus = isPayos
        ? OrderStatus.PENDING_PAYMENT
        : OrderStatus.PENDING_CONFIRMATION;
      const maxPending = isPayos
        ? BUSINESS_RULES.MAX_PENDING_PAYOS_ORDERS_PER_CUSTOMER
        : BUSINESS_RULES.MAX_PENDING_COD_ORDERS_PER_CUSTOMER;
      const limitCode = isPayos
        ? API_ERROR_CODES.ORDER_PAYOS_PENDING_LIMIT_EXCEEDED
        : API_ERROR_CODES.ORDER_PENDING_LIMIT_EXCEEDED;
      const limitDetail = isPayos
        ? MESSAGES.ORDERS.PAYOS_PENDING_LIMIT_EXCEEDED
        : MESSAGES.ORDERS.PENDING_LIMIT_EXCEEDED;

      const [pendingCountRow] = await tx
        .select({ total: count() })
        .from(orders)
        .where(
          and(
            eq(orders.customerId, sub),
            eq(orders.orderStatus, pendingStatus),
            eq(orders.paymentMethod, params.paymentMethod),
          ),
        );
      const pendingCount = Number(pendingCountRow?.total ?? 0);

      if (pendingCount >= maxPending) {
        throw new UnprocessableEntityException({
          code: limitCode,
          detail: limitDetail,
          invalidParams: [
            {
              name: "customerId",
              code: limitCode,
              reason: limitDetail,
              params: {
                maxPendingOrders: maxPending,
                currentPendingOrders: pendingCount,
              },
            },
          ],
        });
      }

      const totals = this.computeOrderTotals({
        evaluated,
        requestedLoyaltyPoints: input.loyaltyPoints,
        availableRewardPoints: lockedCustomer.rewardPoints,
        shippingFeeVnd: params.shippingFeeVnd,
        clientTotalVnd: input.clientTotalVnd,
      });

      if (isPayos && totals.totalAmountVnd <= 0) {
        throw new UnprocessableEntityException({
          code: API_ERROR_CODES.ORDER_PAYOS_ZERO_AMOUNT,
          detail: MESSAGES.ORDERS.PAYOS_ZERO_AMOUNT,
        });
      }

      if (totals.loyaltyPointsUsed > 0) {
        await tx
          .update(users)
          .set({
            rewardPoints: sql`${users.rewardPoints} - ${totals.loyaltyPointsUsed}`,
          })
          .where(and(eq(users.id, sub), isNull(users.deletedAt)));
      }

      const timeoutMinutes = isPayos
        ? BUSINESS_RULES.ORDER_PAYMENT_TIMEOUT_MINUTES
        : BUSINESS_RULES.COD_CONFIRMATION_TIMEOUT_MINUTES;
      const reservationExpiresAt = new Date(
        now.getTime() + timeoutMinutes * 60_000,
      );
      const paymentOrderCode = isPayos ? generatePayosOrderCode(now) : null;

      return this.insertOrderAndPaymentRecords(tx, {
        customerId: sub,
        evaluated,
        productRows,
        totals,
        fefoPlan,
        now,
        reservationExpiresAt,
        receiverName: params.receiverName,
        receiverPhone: params.receiverPhone,
        shippingAddress: params.shippingAddress,
        shippingDistanceKm: params.shippingDistanceKm,
        shippingDistanceKmStr: params.shippingDistanceKmStr,
        shippingFeeVnd: params.shippingFeeVnd,
        yyyymmdd: params.yyyymmdd,
        paymentMethod: params.paymentMethod,
        orderStatus: pendingStatus,
        paymentOrderCode,
      });
    });
  }

  private async loadActiveCustomer(
    executor: DrizzleDB | DrizzleTx,
    sub: string,
    lockForUpdate: boolean,
  ): Promise<{ id: string; rewardPoints: number }> {
    const query = executor
      .select({
        id: users.id,
        status: users.status,
        rewardPoints: users.rewardPoints,
      })
      .from(users)
      .where(and(eq(users.id, sub), isNull(users.deletedAt)));

    const [user] = lockForUpdate
      ? await query.for("update")
      : await query.limit(1);

    if (!user) {
      throw new UnauthorizedException({
        code: API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED,
        detail: MESSAGES.AUTH.TOKEN_INVALID_OR_EXPIRED,
      });
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException({
        code: API_ERROR_CODES.AUTH_ACCOUNT_SUSPENDED,
        detail: MESSAGES.AUTH.ACCOUNT_SUSPENDED,
      });
    }

    return { id: user.id, rewardPoints: user.rewardPoints };
  }

  private assertCheckoutItemsValid(
    evaluated: readonly EvaluatedCartItem[],
  ): void {
    const missingItems = evaluated.filter((item) => !item.isSellableSku);
    if (missingItems.length > 0) {
      throw new NotFoundException({
        code: API_ERROR_CODES.PRODUCT_NOT_FOUND,
        detail: MESSAGES.PRODUCTS.NOT_FOUND,
        invalidParams: missingItems.map((item) => ({
          name: "items",
          code: API_ERROR_CODES.PRODUCT_NOT_FOUND,
          reason: MESSAGES.PRODUCTS.NOT_FOUND,
          params: { productId: item.normalized.productId },
        })),
      });
    }

    const shortItems = evaluated.filter(
      (item) => item.issue === "INSUFFICIENT_STOCK",
    );
    if (shortItems.length > 0) {
      throw new ConflictException({
        code: API_ERROR_CODES.INSUFFICIENT_STOCK,
        detail: MESSAGES.ORDERS.INSUFFICIENT_STOCK,
        invalidParams: shortItems.map((item) => ({
          name: "items",
          code: API_ERROR_CODES.INSUFFICIENT_STOCK,
          reason: MESSAGES.ORDERS.INSUFFICIENT_STOCK,
          params: {
            productId: item.normalized.productId,
            requested: item.normalized.quantity,
            available: item.availableQuantity,
          },
        })),
      });
    }
  }

  private computeOrderTotals(params: {
    readonly evaluated: readonly EvaluatedCartItem[];
    readonly requestedLoyaltyPoints: number;
    readonly availableRewardPoints: number;
    readonly shippingFeeVnd: number;
    readonly clientTotalVnd: number | undefined;
  }): ComputedOrderTotals {
    const subtotalVnd = params.evaluated.reduce(
      (sum, item) => sum + item.lineTotalVnd,
      0,
    );
    // Cap loyalty redemption strictly at merchandise subtotal; never subsidize 3PL shipping fees.
    const loyaltyPointsUsed = Math.min(
      params.requestedLoyaltyPoints,
      params.availableRewardPoints,
      subtotalVnd,
    );
    const discountAmountVnd = loyaltyPointsUsed;
    const totalAmountVnd =
      subtotalVnd - discountAmountVnd + params.shippingFeeVnd;

    this.logClientTotalMismatchIfAny(params.clientTotalVnd, totalAmountVnd);

    return {
      subtotalVnd,
      loyaltyPointsUsed,
      discountAmountVnd,
      totalAmountVnd,
    };
  }

  private async insertOrderAndPaymentRecords(
    tx: DrizzleTx,
    params: {
      readonly customerId: string;
      readonly evaluated: readonly EvaluatedCartItem[];
      readonly productRows: ReadonlyMap<string, CatalogProductStockRow>;
      readonly totals: ComputedOrderTotals;
      readonly fefoPlan: FefoAllocationPlan;
      readonly now: Date;
      readonly reservationExpiresAt: Date;
      readonly receiverName: string;
      readonly receiverPhone: string;
      readonly shippingAddress: string;
      readonly shippingDistanceKm: number;
      readonly shippingDistanceKmStr: string;
      readonly shippingFeeVnd: number;
      readonly yyyymmdd: string;
      readonly paymentMethod:
        | typeof PaymentMethod.COD
        | typeof PaymentMethod.PAYOS;
      readonly orderStatus: OrderStatus;
      readonly paymentOrderCode: number | null;
    },
  ): Promise<{
    projection: OrderProjection;
    paymentId: string;
    paymentOrderCode: number | null;
    reservationExpiresAt: Date;
  }> {
    const orderCode = buildOrderCode(params.yyyymmdd);
    const [createdOrder] = await tx
      .insert(orders)
      .values({
        orderCode,
        customerId: params.customerId,
        receiverName: params.receiverName,
        receiverPhone: params.receiverPhone,
        shippingAddress: params.shippingAddress,
        shippingDistanceKm: params.shippingDistanceKmStr,
        shippingFee: params.shippingFeeVnd,
        subtotal: params.totals.subtotalVnd,
        discountAmount: params.totals.discountAmountVnd,
        loyaltyPointsUsed: params.totals.loyaltyPointsUsed,
        totalAmount: params.totals.totalAmountVnd,
        paymentMethod: params.paymentMethod,
        paymentStatus: PaymentStatus.PENDING,
        orderStatus: params.orderStatus,
        reservationExpiresAt: params.reservationExpiresAt,
      })
      .returning(ORDER_COLUMNS);

    if (!createdOrder) {
      throw new Error("Failed to insert order record.");
    }

    const insertedItems = await tx
      .insert(orderItems)
      .values(
        params.evaluated.map((item) => ({
          orderId: createdOrder.id,
          productId: item.normalized.productId,
          quantity: item.normalized.quantityFormatted,
          unitPrice: item.unitPriceVnd,
        })),
      )
      .returning({
        id: orderItems.id,
        productId: orderItems.productId,
        unitPrice: orderItems.unitPrice,
      });

    const insertedItemIdByKey = new Map(
      insertedItems.map((row) => [`${row.productId}:${row.unitPrice}`, row.id]),
    );

    await applyFefoAllocations(
      tx,
      params.fefoPlan,
      insertedItemIdByKey,
      params.now,
      (allocation) => {
        const productRow = params.productRows.get(allocation.productId);
        if (!productRow) {
          throw new Error(
            `Missing product pricing row for ${allocation.productId}.`,
          );
        }
        const unitPriceVnd = resolveBatchUnitPriceVnd(productRow, allocation);
        return `${allocation.productId}:${unitPriceVnd}`;
      },
    );

    const [createdPayment] = await tx
      .insert(payments)
      .values({
        orderId: createdOrder.id,
        amount: params.totals.totalAmountVnd,
        paymentMethod: params.paymentMethod,
        status: PaymentStatus.PENDING,
        transactionType: PaymentTransactionType.PAYMENT,
        orderCode: params.paymentOrderCode,
      })
      .returning({ id: payments.id });

    if (params.paymentMethod === PaymentMethod.PAYOS && !createdPayment) {
      throw new Error("Failed to insert payment record.");
    }
    const paymentId = createdPayment?.id ?? "";

    const projectedItems: OrderItemProjection[] = params.evaluated.map(
      (item) => ({
        id:
          insertedItemIdByKey.get(
            `${item.normalized.productId}:${item.unitPriceVnd}`,
          ) ?? "",
        productId: item.normalized.productId,
        productName: item.row?.name ?? "",
        productSlug: item.row?.slug ?? "",
        productImageUrl: item.row?.imageUrls?.[0] ?? null,
        unit: item.row?.unit ?? "",
        quantity: item.normalized.quantity,
        unitPriceVnd: item.unitPriceVnd,
        lineTotalVnd: item.lineTotalVnd,
      }),
    );

    return {
      projection: this.mapOrderRowToProjection(createdOrder, projectedItems),
      paymentId,
      paymentOrderCode: params.paymentOrderCode,
      reservationExpiresAt: params.reservationExpiresAt,
    };
  }

  private async resolveCartValidationShipping(
    sub: string,
    input: ValidateCartRequestInput,
  ): Promise<ShippingQuote | null> {
    if (input.addressId !== undefined || input.placeId !== undefined) {
      return this.shippingService.quoteForCustomer(sub, {
        addressId: input.addressId,
        placeId: input.placeId,
        isSubscription: false,
      });
    }

    const defaultAddress =
      await this.addressService.resolveOptionalDefaultAddressForQuote(sub);

    if (!defaultAddress) {
      return null;
    }

    return this.shippingService.quoteForCoordinates(
      {
        latitude: defaultAddress.latitude,
        longitude: defaultAddress.longitude,
      },
      { isSubscription: false },
    );
  }

  private async loadCatalogProductsWithStock(
    executor: DrizzleDB | DrizzleTx,
    productIds: readonly string[],
  ): Promise<Map<string, CatalogProductStockRow>> {
    const rows = await executor
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        imageUrls: products.imageUrls,
        unit: products.unit,
        basePrice: products.basePrice,
        salePrice: products.salePrice,
        isActive: products.isActive,
        deletedAt: products.deletedAt,
        categoryIsActive: categories.isActive,
        categoryDeletedAt: categories.deletedAt,
        availableQuantity: LIVE_AVAILABLE_QUANTITY_EXPR,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(inArray(products.id, [...productIds]));

    return new Map(rows.map((row) => [row.id, row]));
  }

  private evaluateCartItems(
    normalizedItems: readonly NormalizedCartItem[],
    productRows: ReadonlyMap<string, CatalogProductStockRow>,
  ): EvaluatedCartItem[] {
    return normalizedItems.map((normalized) => {
      const row = productRows.get(normalized.productId);
      const isSellableSku =
        row?.deletedAt === null &&
        row.isActive &&
        row.categoryDeletedAt === null &&
        row.categoryIsActive;

      if (!row || !isSellableSku) {
        return {
          normalized,
          row,
          isSellableSku: false,
          availableQuantity: 0,
          availableCents: 0,
          unitPriceVnd: 0,
          lineTotalVnd: 0,
          isAvailable: false,
          issue: "PRODUCT_UNAVAILABLE",
        };
      }

      const availableQuantity = Number(row.availableQuantity);
      const availableCents = Math.round(availableQuantity * 100);
      const unitPriceVnd = row.salePrice ?? row.basePrice;
      const lineTotalVnd = this.computeLineTotalVnd(
        normalized.quantityCents,
        unitPriceVnd,
      );
      const isStockEnough = availableCents >= normalized.quantityCents;

      return {
        normalized,
        row,
        isSellableSku: true,
        availableQuantity,
        availableCents,
        unitPriceVnd,
        lineTotalVnd,
        isAvailable: isStockEnough,
        issue: isStockEnough ? null : "INSUFFICIENT_STOCK",
      };
    });
  }

  private splitEvaluatedItemsByFefoPricing(
    evaluated: readonly EvaluatedCartItem[],
    allocations: readonly PlannedBatchAllocation[],
  ): EvaluatedCartItem[] {
    const result: EvaluatedCartItem[] = [];

    for (const item of evaluated) {
      if (!item.isAvailable || !item.row) {
        result.push(item);
        continue;
      }

      const productAllocations = allocations.filter(
        (allocation) => allocation.productId === item.normalized.productId,
      );
      if (productAllocations.length === 0) {
        result.push(item);
        continue;
      }

      const centsByUnitPrice = new Map<number, number>();
      for (const allocation of productAllocations) {
        const unitPriceVnd = resolveBatchUnitPriceVnd(item.row, allocation);
        centsByUnitPrice.set(
          unitPriceVnd,
          (centsByUnitPrice.get(unitPriceVnd) ?? 0) + allocation.allocatedCents,
        );
      }

      for (const [unitPriceVnd, quantityCents] of centsByUnitPrice.entries()) {
        result.push({
          ...item,
          normalized: {
            productId: item.normalized.productId,
            quantityCents,
            quantity: quantityCents / 100,
            quantityFormatted: formatQuantityFromCents(quantityCents),
          },
          unitPriceVnd,
          lineTotalVnd: this.computeLineTotalVnd(quantityCents, unitPriceVnd),
        });
      }
    }

    return result;
  }

  private normalizeCartItems(
    rawItems: readonly { productId: string; quantity: number }[],
  ): NormalizedCartItem[] {
    const mergedCentsByProduct = new Map<string, number>();

    for (const item of rawItems) {
      const cents = Math.round(item.quantity * 100);
      mergedCentsByProduct.set(
        item.productId,
        (mergedCentsByProduct.get(item.productId) ?? 0) + cents,
      );
    }

    const maxCents = Math.round(ORDER_ITEM_MAX_QUANTITY * 100);
    const normalized: NormalizedCartItem[] = [];

    for (const [productId, quantityCents] of mergedCentsByProduct.entries()) {
      if (quantityCents <= 0 || quantityCents > maxCents) {
        throw new BadRequestException({
          code: API_ERROR_CODES.VALIDATION_FAILED,
          detail: MESSAGES.VALIDATION.MAX_VALUE,
          invalidParams: [
            {
              name: "items",
              code: API_ERROR_CODES.TOO_BIG,
              reason: MESSAGES.VALIDATION.MAX_VALUE,
              params: {
                productId,
                maximum: ORDER_ITEM_MAX_QUANTITY,
              },
            },
          ],
        });
      }

      const quantity = quantityCents / 100;
      normalized.push({
        productId,
        quantityCents,
        quantity,
        quantityFormatted: quantity.toFixed(2),
      });
    }

    normalized.sort((a, b) => a.productId.localeCompare(b.productId));
    return normalized;
  }

  private async hydrateOrderItemsByOrderIds(
    orderIds: readonly string[],
  ): Promise<Map<string, OrderItemProjection[]>> {
    const itemsByOrderId = new Map<string, OrderItemProjection[]>();
    if (orderIds.length === 0) {
      return itemsByOrderId;
    }

    const rows = await this.fetchOrderItemsWithProduct(this.db, orderIds);

    for (const row of rows) {
      const item = this.mapOrderItemProjection(row);
      const existing = itemsByOrderId.get(row.orderId);
      if (existing) {
        existing.push(item);
      } else {
        itemsByOrderId.set(row.orderId, [item]);
      }
    }

    return itemsByOrderId;
  }

  private async fetchOrderItemsWithProduct(
    executor: DrizzleDB | DrizzleTx,
    orderIds: readonly string[],
  ): Promise<OrderItemWithProductRow[]> {
    return (
      executor
        .select({
          id: orderItems.id,
          orderId: orderItems.orderId,
          productId: orderItems.productId,
          quantity: orderItems.quantity,
          unitPrice: orderItems.unitPrice,
          productName: products.name,
          productSlug: products.slug,
          productImageUrls: products.imageUrls,
          unit: products.unit,
        })
        .from(orderItems)
        // Preserve historical order line items even if a product was later deactivated or soft-deleted.
        .innerJoin(products, eq(orderItems.productId, products.id))
        .where(inArray(orderItems.orderId, [...orderIds]))
        .orderBy(asc(orderItems.id))
    );
  }

  private mapOrderItemProjection(
    row: OrderItemWithProductRow,
  ): OrderItemProjection {
    const quantity = Number(row.quantity);
    const quantityCents = toQuantityCents(quantity);

    return {
      id: row.id,
      productId: row.productId,
      productName: row.productName,
      productSlug: row.productSlug,
      productImageUrl: row.productImageUrls?.[0] ?? null,
      unit: row.unit,
      quantity,
      unitPriceVnd: row.unitPrice,
      lineTotalVnd: this.computeLineTotalVnd(quantityCents, row.unitPrice),
    };
  }

  private assertOrderCancellablePayment(orderRow: OrderRow): void {
    if (
      orderRow.paymentStatus === PaymentStatus.PAID ||
      orderRow.paymentMethod === PaymentMethod.SUBSCRIPTION
    ) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.ORDER_PAID_CANCELLATION_FORBIDDEN,
        detail: MESSAGES.ORDERS.PAID_CANCELLATION_FORBIDDEN,
      });
    }
  }

  private async cancelOrderWithinTx(
    tx: DrizzleTx,
    orderRow: OrderRow,
    hoursThreshold: number,
    now: Date,
    terminalPaymentStatus: PaymentStatus = PaymentStatus.CANCELLED,
  ): Promise<{
    cancelledOrder: OrderRow;
    cancelledPayosOrderCode: number | null;
  }> {
    this.assertOrderCancellablePayment(orderRow);

    if (ALLOCATED_CANCELLABLE_STATUSES.includes(orderRow.orderStatus)) {
      await this.releaseOrderAllocations(tx, orderRow.id, hoursThreshold, now);
    }

    if (orderRow.loyaltyPointsUsed > 0) {
      await this.refundLoyaltyPoints(
        tx,
        orderRow.customerId,
        orderRow.loyaltyPointsUsed,
      );
    }

    const [cancelledOrder] = await tx
      .update(orders)
      .set({
        orderStatus: OrderStatus.CANCELLED,
        paymentStatus: terminalPaymentStatus,
        reservationExpiresAt: null,
        updatedAt: now,
      })
      .where(eq(orders.id, orderRow.id))
      .returning(ORDER_COLUMNS);

    if (!cancelledOrder) {
      throw new Error("Failed to cancel order record.");
    }

    const paymentWhere = and(
      eq(payments.orderId, orderRow.id),
      eq(payments.status, PaymentStatus.PENDING),
      eq(payments.transactionType, PaymentTransactionType.PAYMENT),
    );

    const paymentUpdate = tx
      .update(payments)
      .set({
        status: terminalPaymentStatus,
        updatedAt: now,
      })
      .where(paymentWhere);

    let cancelledPayosOrderCode: number | null = null;
    if (
      orderRow.paymentMethod === PaymentMethod.PAYOS &&
      terminalPaymentStatus === PaymentStatus.CANCELLED
    ) {
      const cancelledPayments = await paymentUpdate.returning({
        orderCode: payments.orderCode,
      });

      cancelledPayosOrderCode =
        cancelledPayments.find((row) => row.orderCode !== null)?.orderCode ??
        null;
    } else {
      await paymentUpdate;
    }

    return { cancelledOrder, cancelledPayosOrderCode };
  }

  private async lockOrderForUpdate(
    tx: DrizzleTx,
    orderId: string,
  ): Promise<OrderRow> {
    const [orderRow] = await tx
      .select(ORDER_COLUMNS)
      .from(orders)
      .where(eq(orders.id, orderId))
      .for("update");

    if (!orderRow) {
      throw new NotFoundException({
        code: API_ERROR_CODES.ORDER_NOT_FOUND,
        detail: MESSAGES.ORDERS.NOT_FOUND,
      });
    }

    return orderRow;
  }

  private planFefoAllocations(
    items: readonly NormalizedCartItem[],
    candidateBatches: Awaited<ReturnType<typeof lockCandidateSellableBatches>>,
  ): FefoAllocationPlan {
    const outcome = planFefoAllocations(items, candidateBatches);
    if (!outcome.ok) {
      throw new ConflictException({
        code: API_ERROR_CODES.INSUFFICIENT_STOCK,
        detail: MESSAGES.ORDERS.INSUFFICIENT_STOCK,
        invalidParams: outcome.shortages.map((shortage) => ({
          name: "items",
          code: API_ERROR_CODES.INSUFFICIENT_STOCK,
          reason: MESSAGES.ORDERS.INSUFFICIENT_STOCK,
          params: shortage,
        })),
      });
    }
    return outcome.plan;
  }

  private async releaseOrderAllocations(
    tx: DrizzleTx,
    orderId: string,
    hoursThreshold: number,
    now: Date,
  ): Promise<void> {
    const activeAllocations = await tx
      .select({
        id: batchAllocations.id,
        batchId: batchAllocations.batchId,
        allocatedQuantity: batchAllocations.allocatedQuantity,
      })
      .from(batchAllocations)
      .innerJoin(orderItems, eq(batchAllocations.orderItemId, orderItems.id))
      .where(
        and(
          eq(orderItems.orderId, orderId),
          isNull(batchAllocations.releasedAt),
        ),
      );

    if (activeAllocations.length === 0) {
      return;
    }

    const restoredCentsByBatchId = new Map<string, number>();
    const allocationIds: string[] = [];

    for (const allocation of activeAllocations) {
      allocationIds.push(allocation.id);
      const cents = toQuantityCents(allocation.allocatedQuantity);
      restoredCentsByBatchId.set(
        allocation.batchId,
        (restoredCentsByBatchId.get(allocation.batchId) ?? 0) + cents,
      );
    }

    const sortedBatchIds = Array.from(restoredCentsByBatchId.keys()).sort(
      (a, b) => a.localeCompare(b),
    );

    const lockedBatches = await tx
      .select({
        id: batches.id,
        availableQuantity: batches.availableQuantity,
        expirationDate: batches.expirationDate,
        status: batches.status,
      })
      .from(batches)
      .where(inArray(batches.id, sortedBatchIds))
      .orderBy(asc(batches.id))
      .for("update");

    for (const batch of lockedBatches) {
      const restoredCents = restoredCentsByBatchId.get(batch.id) ?? 0;
      if (restoredCents <= 0) {
        continue;
      }

      const nextAvailableCents =
        toQuantityCents(batch.availableQuantity) + restoredCents;
      const nextStatus = this.resolveBatchStatusAfterRestore(
        batch.expirationDate,
        hoursThreshold,
        now,
      );

      await tx
        .update(batches)
        .set({
          availableQuantity: formatQuantityFromCents(nextAvailableCents),
          status: nextStatus,
          ...(nextStatus === BatchStatus.EXPIRED
            ? { isFlashSale: false, flashSaleDiscountPercent: null }
            : {}),
          updatedAt: now,
        })
        .where(eq(batches.id, batch.id));
    }

    await tx
      .update(batchAllocations)
      .set({ releasedAt: now })
      .where(
        and(
          inArray(batchAllocations.id, allocationIds),
          isNull(batchAllocations.releasedAt),
        ),
      );
  }

  private async refundLoyaltyPoints(
    tx: DrizzleTx,
    customerId: string,
    loyaltyPointsUsed: number,
  ): Promise<void> {
    await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, customerId), isNull(users.deletedAt)))
      .for("update");

    await tx
      .update(users)
      .set({
        rewardPoints: sql`${users.rewardPoints} + ${loyaltyPointsUsed}`,
      })
      .where(and(eq(users.id, customerId), isNull(users.deletedAt)));
  }

  private async hydrateStaffOrderProjection(
    tx: DrizzleTx,
    orderRow: OrderRow,
    allocationScope: "active" | "released",
  ): Promise<StaffOrderProjection> {
    const itemRows = await this.fetchOrderItemsWithProduct(tx, [orderRow.id]);
    const itemIds = itemRows.map((item) => item.id);
    const allocationsByItemId = new Map<
      string,
      BatchAllocationSummaryProjection[]
    >();

    if (itemIds.length > 0) {
      const releaseFilter =
        allocationScope === "active"
          ? isNull(batchAllocations.releasedAt)
          : isNotNull(batchAllocations.releasedAt);

      const allocationRows = await tx
        .select({
          id: batchAllocations.id,
          orderItemId: batchAllocations.orderItemId,
          batchId: batchAllocations.batchId,
          batchCode: batches.batchCode,
          expirationDate: batches.expirationDate,
          allocatedQuantity: batchAllocations.allocatedQuantity,
          releasedAt: batchAllocations.releasedAt,
        })
        .from(batchAllocations)
        .innerJoin(batches, eq(batchAllocations.batchId, batches.id))
        .where(
          and(inArray(batchAllocations.orderItemId, itemIds), releaseFilter),
        )
        .orderBy(asc(batches.expirationDate), asc(batchAllocations.id));

      for (const row of allocationRows) {
        const entry: BatchAllocationSummaryProjection = {
          id: row.id,
          batchId: row.batchId,
          batchCode: row.batchCode,
          expirationDate: row.expirationDate.toISOString(),
          allocatedQuantity: Number(row.allocatedQuantity),
          releasedAt: row.releasedAt ? row.releasedAt.toISOString() : null,
        };

        const existing = allocationsByItemId.get(row.orderItemId);
        if (existing) {
          existing.push(entry);
        } else {
          allocationsByItemId.set(row.orderItemId, [entry]);
        }
      }
    }

    const staffItems: StaffOrderItemProjection[] = itemRows.map((row) => ({
      ...this.mapOrderItemProjection(row),
      allocations: allocationsByItemId.get(row.id) ?? [],
    }));

    return {
      ...this.mapOrderRowToProjection(orderRow, []),
      customerId: orderRow.customerId,
      items: staffItems,
    };
  }

  private resolveBatchStatusAfterRestore(
    expirationDate: Date,
    hoursThreshold: number,
    now: Date,
  ): BatchStatus {
    const remainingMs = expirationDate.getTime() - now.getTime();
    if (remainingMs <= 0) {
      return BatchStatus.EXPIRED;
    }
    if (remainingMs < hoursThreshold * TIME_IN_MS.HOUR) {
      return BatchStatus.NEAR_EXPIRY;
    }
    return BatchStatus.IN_STOCK;
  }

  private async resolveHoursThreshold(): Promise<number> {
    try {
      const settings = await this.farmSettingsService.getSettings();
      const hoursThreshold = settings.flashSaleConfig.hoursThreshold;

      if (!Number.isFinite(hoursThreshold) || hoursThreshold <= 0) {
        throw new UnprocessableEntityException({
          code: API_ERROR_CODES.FARM_FLASH_SALE_CONFIG_INVALID,
          detail: MESSAGES.FARMS.FLASH_SALE_CONFIG_INVALID,
        });
      }

      return hoursThreshold;
    } catch (error) {
      if (error instanceof NotFoundException && env.NODE_ENV !== "production") {
        this.logger.warn(
          `Farm settings not found in ${env.NODE_ENV}; falling back to default ${BUSINESS_RULES.FLASH_SALE_HOURS_THRESHOLD}h threshold.`,
        );
        return BUSINESS_RULES.FLASH_SALE_HOURS_THRESHOLD;
      }

      throw error;
    }
  }

  private isPickListOrderStatus(
    status: OrderStatus,
  ): status is PickListOrderStatus {
    return (PICK_LIST_ALLOWED_STATUSES as readonly OrderStatus[]).includes(
      status,
    );
  }

  private async hydratePendingPaymentUrls(
    orderRows: readonly OrderRow[],
  ): Promise<Map<string, string | null>> {
    const pendingIds = orderRows
      .filter((row) => row.orderStatus === OrderStatus.PENDING_PAYMENT)
      .map((row) => row.id);

    const result = new Map<string, string | null>();
    if (pendingIds.length === 0) {
      return result;
    }

    const paymentRows = await this.db
      .select({
        orderId: payments.orderId,
        paymentUrl: payments.paymentUrl,
      })
      .from(payments)
      .where(
        and(
          inArray(payments.orderId, pendingIds),
          eq(payments.transactionType, PaymentTransactionType.PAYMENT),
        ),
      );

    for (const row of paymentRows) {
      if (row.orderId) {
        result.set(row.orderId, row.paymentUrl);
      }
    }

    return result;
  }

  private mapOrderRowToProjection(
    row: OrderRow,
    items: OrderItemProjection[],
    paymentUrl: string | null = null,
  ): OrderProjection {
    return {
      id: row.id,
      orderCode: row.orderCode,
      orderStatus: row.orderStatus,
      paymentMethod: row.paymentMethod,
      paymentStatus: row.paymentStatus,
      receiverName: row.receiverName,
      receiverPhone: row.receiverPhone,
      shippingAddress: row.shippingAddress,
      shippingDistanceKm: Number(row.shippingDistanceKm),
      shippingFeeVnd: row.shippingFee,
      subtotalVnd: row.subtotal,
      discountAmountVnd: row.discountAmount,
      loyaltyPointsUsed: row.loyaltyPointsUsed,
      totalAmountVnd: row.totalAmount,
      paymentUrl:
        row.orderStatus === OrderStatus.PENDING_PAYMENT ? paymentUrl : null,
      reservationExpiresAt: row.reservationExpiresAt
        ? row.reservationExpiresAt.toISOString()
        : null,
      items,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private computeLineTotalVnd(
    quantityCents: number,
    unitPriceVnd: number,
  ): number {
    return Math.round((quantityCents * unitPriceVnd) / 100);
  }

  private logClientTotalMismatchIfAny(
    clientTotalVnd: number | undefined,
    serverTotalVnd: number,
  ): void {
    if (clientTotalVnd !== undefined && clientTotalVnd !== serverTotalVnd) {
      this.logger.debug(
        `${MESSAGES.ORDERS.CLIENT_TOTAL_MISMATCH_PREFIX} server=${serverTotalVnd} client=${clientTotalVnd}`,
      );
    }
  }

  private isPaymentOrderCodeUniqueViolation(error: unknown): boolean {
    const details = extractDatabaseErrorDetails(error);
    return (
      details.isDatabaseError &&
      details.code === PG_ERROR_CODE.UNIQUE_VIOLATION &&
      details.constraint === PAYMENT_ORDER_CODE_UIDX
    );
  }
}

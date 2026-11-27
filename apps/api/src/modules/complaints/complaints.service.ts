import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  API_ERROR_CODES,
  BUSINESS_RULES,
  ComplaintCategory,
  type ComplaintProofImageUrls,
  ComplaintRefundChannel,
  ComplaintResolution,
  ComplaintStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
  type UserRole,
} from "@greenroots/shared";
import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { PG_ERROR_CODE } from "@/common/constants/error.constant";
import { MESSAGES } from "@/common/constants/messages.constant";
import { TIME_IN_MS } from "@/common/constants/time.constant";
import type { PaginationMetaDto } from "@/common/dto/api-response.dto";
import { buildPaginationMeta } from "@/common/utils/api-response.util";
import { escapeLikePattern } from "@/common/utils/query.util";
import {
  DATABASE_CONNECTION,
  type DrizzleDB,
  type DrizzleTx,
} from "@/database/database.module";
import {
  complaints,
  orderItems,
  orders,
  payments,
  users,
} from "@/database/schemas";
import { CloudinaryService } from "@/modules/media/cloudinary.service";
import {
  applyFefoAllocations,
  buildOrderCode,
  formatOrderCalendarDateVn,
  formatQuantityFromCents,
  isOrderCodeUniqueViolation,
  lockCandidateSellableBatches,
  planFefoAllocations,
  toQuantityCents,
  type FefoAllocationItemInput,
} from "@/modules/orders/fefo-allocation.util";
import { ORDER_CODE_MAX_GENERATION_ATTEMPTS } from "@/modules/orders/orders.constant";
import { COMPLAINTS_RESOLVE_ALLOWED_ROLES } from "./complaints.constant";
import type {
  ComplaintProjection,
  CreateComplaintInput,
  ListComplaintsQuery,
  ResolveComplaintInput,
  StaffComplaintProjection,
  TriageComplaintInput,
} from "./dto";

const COMPLAINT_WINDOW_MS =
  BUSINESS_RULES.COMPLAINT_WINDOW_HOURS * TIME_IN_MS.HOUR;

const STAFF_COMPLAINT_SELECT = {
  id: complaints.id,
  orderId: complaints.orderId,
  orderCode: orders.orderCode,
  orderTotalVnd: orders.totalAmount,
  orderPaymentMethod: orders.paymentMethod,
  orderDeliveredAt: orders.deliveredAt,
  customerId: complaints.customerId,
  customerName: users.fullName,
  customerPhone: users.phone,
  category: complaints.category,
  affectedOrderItemIds: complaints.affectedOrderItemIds,
  reason: complaints.reason,
  proofImageUrls: complaints.proofImageUrls,
  proofVideoUrl: complaints.proofVideoUrl,
  status: complaints.status,
  resolution: complaints.resolution,
  triagedBy: complaints.triagedBy,
  triagedAt: complaints.triagedAt,
  triageNote: complaints.triageNote,
  resolvedBy: complaints.resolvedBy,
  resolvedAt: complaints.resolvedAt,
  resolutionNote: complaints.resolutionNote,
  refundChannel: complaints.refundChannel,
  refundAmountVnd: complaints.refundAmountVnd,
  replacementOrderId: complaints.replacementOrderId,
  createdAt: complaints.createdAt,
  updatedAt: complaints.updatedAt,
} as const;

type RawStaffComplaintRow = {
  id: string;
  orderId: string;
  orderCode: string;
  orderTotalVnd: number;
  orderPaymentMethod: PaymentMethod;
  orderDeliveredAt: Date | null;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  category: ComplaintCategory;
  affectedOrderItemIds: string[];
  reason: string;
  proofImageUrls: ComplaintProofImageUrls;
  proofVideoUrl: string | null;
  status: ComplaintStatus;
  resolution: ComplaintResolution | null;
  triagedBy: string | null;
  triagedAt: Date | null;
  triageNote: string | null;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  resolutionNote: string | null;
  refundChannel: ComplaintRefundChannel | null;
  refundAmountVnd: number | null;
  replacementOrderId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toStaffComplaintProjection(
  row: RawStaffComplaintRow,
): StaffComplaintProjection {
  return {
    id: row.id,
    orderId: row.orderId,
    orderCode: row.orderCode,
    orderTotalVnd: row.orderTotalVnd,
    orderPaymentMethod: row.orderPaymentMethod,
    orderDeliveredAt: row.orderDeliveredAt
      ? row.orderDeliveredAt.toISOString()
      : null,
    customerId: row.customerId,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    category: row.category,
    affectedOrderItemIds: row.affectedOrderItemIds,
    reason: row.reason,
    proofImageUrls: row.proofImageUrls,
    proofVideoUrl: row.proofVideoUrl,
    status: row.status,
    resolution: row.resolution,
    triagedBy: row.triagedBy,
    triagedAt: row.triagedAt ? row.triagedAt.toISOString() : null,
    triageNote: row.triageNote,
    resolvedBy: row.resolvedBy,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    resolutionNote: row.resolutionNote,
    refundChannel: row.refundChannel,
    refundAmountVnd: row.refundAmountVnd,
    replacementOrderId: row.replacementOrderId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const CUSTOMER_COMPLAINT_SELECT = {
  id: complaints.id,
  orderId: complaints.orderId,
  customerId: complaints.customerId,
  category: complaints.category,
  affectedOrderItemIds: complaints.affectedOrderItemIds,
  reason: complaints.reason,
  proofImageUrls: complaints.proofImageUrls,
  proofVideoUrl: complaints.proofVideoUrl,
  status: complaints.status,
  resolution: complaints.resolution,
  triageNote: complaints.triageNote,
  resolutionNote: complaints.resolutionNote,
  refundChannel: complaints.refundChannel,
  refundAmountVnd: complaints.refundAmountVnd,
  replacementOrderId: complaints.replacementOrderId,
  createdAt: complaints.createdAt,
  updatedAt: complaints.updatedAt,
} as const;

type RawCustomerComplaintRow = {
  id: string;
  orderId: string;
  customerId: string;
  category: ComplaintCategory;
  affectedOrderItemIds: string[];
  reason: string;
  proofImageUrls: ComplaintProofImageUrls;
  proofVideoUrl: string | null;
  status: ComplaintStatus;
  resolution: ComplaintResolution | null;
  triageNote: string | null;
  resolutionNote: string | null;
  refundChannel: ComplaintRefundChannel | null;
  refundAmountVnd: number | null;
  replacementOrderId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toCustomerComplaintProjection(
  row: RawCustomerComplaintRow,
): ComplaintProjection {
  return {
    id: row.id,
    orderId: row.orderId,
    customerId: row.customerId,
    category: row.category,
    affectedOrderItemIds: row.affectedOrderItemIds,
    reason: row.reason,
    proofImageUrls: row.proofImageUrls,
    proofVideoUrl: row.proofVideoUrl,
    status: row.status,
    resolution: row.resolution,
    triageNote: row.triageNote,
    resolutionNote: row.resolutionNote,
    refundChannel: row.refundChannel,
    refundAmountVnd: row.refundAmountVnd,
    replacementOrderId: row.replacementOrderId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const record = error as { code?: unknown; cause?: { code?: unknown } };
  return (
    record.code === PG_ERROR_CODE.UNIQUE_VIOLATION ||
    record.cause?.code === PG_ERROR_CODE.UNIQUE_VIOLATION
  );
}

/**
 * Complaint domain service handling customer submission (`ADR-0040`) and
 * staff listing and one-shot triage (`ADR-0045`).
 */
@Injectable()
export class ComplaintsService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DrizzleDB,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  /**
   * Returns the submitted complaint for an owned customer order, or null when none exists (`ADR-0032`).
   */
  async getOrderComplaint(
    customerId: string,
    orderId: string,
  ): Promise<ComplaintProjection | null> {
    const [orderRow] = await this.db
      .select({
        id: orders.id,
        customerId: orders.customerId,
      })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!orderRow || orderRow.customerId !== customerId) {
      throw new NotFoundException({
        code: API_ERROR_CODES.ORDER_NOT_FOUND,
        detail: MESSAGES.ORDERS.NOT_FOUND,
      });
    }

    const [row] = await this.db
      .select(CUSTOMER_COMPLAINT_SELECT)
      .from(complaints)
      .where(eq(complaints.orderId, orderId))
      .limit(1);

    return row ? toCustomerComplaintProjection(row) : null;
  }

  /**
   * Submits a complaint for an owned delivered/completed order within 24 hours of `deliveredAt`.
   */
  async submitComplaint(
    customerId: string,
    orderId: string,
    input: CreateComplaintInput,
    now: Date = new Date(),
  ): Promise<ComplaintProjection> {
    const [orderRow] = await this.db
      .select({
        id: orders.id,
        customerId: orders.customerId,
        orderStatus: orders.orderStatus,
        deliveredAt: orders.deliveredAt,
      })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!orderRow || orderRow.customerId !== customerId) {
      throw new NotFoundException({
        code: API_ERROR_CODES.ORDER_NOT_FOUND,
        detail: MESSAGES.ORDERS.NOT_FOUND,
      });
    }

    const isEligibleStatus =
      orderRow.orderStatus === OrderStatus.DELIVERED ||
      orderRow.orderStatus === OrderStatus.COMPLETED;

    if (!isEligibleStatus || orderRow.deliveredAt === null) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.ORDER_COMPLAINT_NOT_ELIGIBLE,
        detail: MESSAGES.COMPLAINTS.NOT_ELIGIBLE,
      });
    }

    if (now.getTime() - orderRow.deliveredAt.getTime() > COMPLAINT_WINDOW_MS) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.ORDER_COMPLAINT_WINDOW_EXPIRED,
        detail: MESSAGES.COMPLAINTS.WINDOW_EXPIRED,
      });
    }

    const [existingComplaint] = await this.db
      .select({ id: complaints.id })
      .from(complaints)
      .where(eq(complaints.orderId, orderId))
      .limit(1);

    if (existingComplaint) {
      throw new ConflictException({
        code: API_ERROR_CODES.ORDER_COMPLAINT_ALREADY_EXISTS,
        detail: MESSAGES.COMPLAINTS.ALREADY_EXISTS,
      });
    }

    const matchingOrderItems = await this.db
      .select({ id: orderItems.id })
      .from(orderItems)
      .where(
        and(
          eq(orderItems.orderId, orderId),
          inArray(orderItems.id, input.affectedOrderItemIds),
        ),
      );

    if (matchingOrderItems.length !== input.affectedOrderItemIds.length) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.COMPLAINT_ITEMS_INVALID,
        detail: MESSAGES.COMPLAINTS.ITEMS_INVALID,
      });
    }

    // Verify uploaded media metadata via Cloudinary Admin API strictly outside any DB transaction (`ADR-0040`).
    await this.cloudinaryService.verifyComplaintMedia(
      input.proofImageUrls,
      input.proofVideoUrl,
    );

    try {
      const [created] = await this.db
        .insert(complaints)
        .values({
          orderId,
          customerId,
          category: input.category,
          affectedOrderItemIds: input.affectedOrderItemIds,
          reason: input.reason,
          proofImageUrls: input.proofImageUrls,
          proofVideoUrl: input.proofVideoUrl ?? null,
        })
        .returning(CUSTOMER_COMPLAINT_SELECT);

      if (!created) {
        throw new Error("Failed to insert complaint.");
      }

      return toCustomerComplaintProjection(created);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          code: API_ERROR_CODES.ORDER_COMPLAINT_ALREADY_EXISTS,
          detail: MESSAGES.COMPLAINTS.ALREADY_EXISTS,
        });
      }
      throw error;
    }
  }

  /**
   * Lists paginated, filtered, and hydrated complaints for authorized staff (`ADR-0045`).
   *
   * @param query Validated pagination, filter, date range, and search parameters.
   * @returns Hydrated staff complaint projections and pagination metadata.
   */
  async listComplaints(query: ListComplaintsQuery): Promise<{
    items: StaffComplaintProjection[];
    meta: PaginationMetaDto;
  }> {
    const conditions: SQL[] = [];

    if (query.status !== undefined) {
      conditions.push(eq(complaints.status, query.status));
    }
    if (query.resolution !== undefined) {
      conditions.push(eq(complaints.resolution, query.resolution));
    }
    if (query.orderId !== undefined) {
      conditions.push(eq(complaints.orderId, query.orderId));
    }
    if (query.customerId !== undefined) {
      conditions.push(eq(complaints.customerId, query.customerId));
    }
    if (query.from !== undefined) {
      conditions.push(gte(complaints.createdAt, new Date(query.from)));
    }
    if (query.to !== undefined) {
      conditions.push(lte(complaints.createdAt, new Date(query.to)));
    }
    if (query.search !== undefined) {
      const pattern = `%${escapeLikePattern(query.search)}%`;
      const searchCondition = or(
        ilike(orders.orderCode, pattern),
        ilike(users.phone, pattern),
        ilike(users.fullName, pattern),
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const countBase = this.db.select({ total: count() }).from(complaints);
    const [countRow] = await (
      query.search !== undefined
        ? countBase
            .innerJoin(orders, eq(complaints.orderId, orders.id))
            .innerJoin(users, eq(complaints.customerId, users.id))
        : countBase
    ).where(whereClause);

    const total = Number(countRow?.total ?? 0);
    const meta = buildPaginationMeta(total, query.page, query.limit);
    const offset = (query.page - 1) * query.limit;

    if (total === 0 || offset >= total) {
      return { items: [], meta };
    }

    const rows = await this.db
      .select(STAFF_COMPLAINT_SELECT)
      .from(complaints)
      .innerJoin(orders, eq(complaints.orderId, orders.id))
      .innerJoin(users, eq(complaints.customerId, users.id))
      .where(whereClause)
      .orderBy(desc(complaints.createdAt), desc(complaints.id))
      .limit(query.limit)
      .offset(offset);

    return {
      items: rows.map(toStaffComplaintProjection),
      meta,
    };
  }

  /**
   * Transitions a `pending` complaint to `triaged` or `rejected` — or allows `ADMIN`/`SUPER_ADMIN`
   * to override `triaged -> rejected` — under a `FOR UPDATE` row lock (`INV-CMP-6`, `INV-CMP-7`).
   *
   * @param actorId Authenticated staff user UUIDv7 performing the triage.
   * @param actorRole Role of the authenticated staff actor.
   * @param complaintId Target complaint UUIDv7 identifier.
   * @param input Validated triage status and optional/mandatory note.
   * @param now Timestamp override for deterministic testing.
   * @returns Hydrated staff complaint projection.
   */
  async triageComplaint(
    actorId: string,
    actorRole: UserRole,
    complaintId: string,
    input: TriageComplaintInput,
    now: Date = new Date(),
  ): Promise<StaffComplaintProjection> {
    await this.db.transaction(async (tx) => {
      const [locked] = await tx
        .select({
          id: complaints.id,
          status: complaints.status,
        })
        .from(complaints)
        .where(eq(complaints.id, complaintId))
        .for("update");

      if (!locked) {
        throw new NotFoundException({
          code: API_ERROR_CODES.COMPLAINT_NOT_FOUND,
          detail: MESSAGES.COMPLAINTS.NOT_FOUND,
        });
      }

      const isAdminOverride =
        locked.status === ComplaintStatus.TRIAGED &&
        input.status === ComplaintStatus.REJECTED &&
        (COMPLAINTS_RESOLVE_ALLOWED_ROLES as readonly UserRole[]).includes(
          actorRole,
        );

      if (locked.status !== ComplaintStatus.PENDING && !isAdminOverride) {
        throw new UnprocessableEntityException({
          code: API_ERROR_CODES.COMPLAINT_INVALID_STATUS_TRANSITION,
          detail: MESSAGES.COMPLAINTS.INVALID_STATUS_TRANSITION,
        });
      }

      const normalizedNote =
        input.triageNote && input.triageNote.length > 0
          ? input.triageNote
          : null;

      await tx
        .update(complaints)
        .set({
          status: input.status,
          triagedBy: actorId,
          triagedAt: now,
          triageNote: normalizedNote,
          updatedAt: now,
        })
        .where(eq(complaints.id, complaintId));
    });

    return this.findStaffComplaintById(complaintId);
  }

  /**
   * Atomically resolves a `triaged` complaint (`triaged -> approved`) via dual-channel refund
   * or a `0đ` FEFO-allocated replacement order (`INV-CMP-9..13`, `ADR-0046`).
   *
   * Acquires `FOR UPDATE` row locks strictly in `complaints -> orders -> batches -> users` order.
   *
   * @param actorId Authenticated Admin/SuperAdmin user UUIDv7.
   * @param complaintId Target complaint UUIDv7 identifier.
   * @param input Validated resolution payload.
   * @param now Timestamp override for deterministic testing.
   * @returns Hydrated staff complaint projection.
   */
  async resolveComplaint(
    actorId: string,
    complaintId: string,
    input: ResolveComplaintInput,
    now: Date = new Date(),
  ): Promise<StaffComplaintProjection> {
    const maxAttempts =
      input.resolution === ComplaintResolution.REPLACEMENT
        ? ORDER_CODE_MAX_GENERATION_ATTEMPTS
        : 1;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        await this.db.transaction(async (tx) => {
          await this.executeResolveTransaction(
            tx,
            actorId,
            complaintId,
            input,
            now,
          );
        });
        return this.findStaffComplaintById(complaintId);
      } catch (error) {
        if (
          input.resolution === ComplaintResolution.REPLACEMENT &&
          isOrderCodeUniqueViolation(error)
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new ConflictException({
      code: API_ERROR_CODES.CONFLICT_RECORD,
      detail: MESSAGES.ORDERS.CODE_GENERATION_EXHAUSTED,
    });
  }

  private async executeResolveTransaction(
    tx: DrizzleTx,
    actorId: string,
    complaintId: string,
    input: ResolveComplaintInput,
    now: Date,
  ): Promise<void> {
    // Lock order: complaints -> orders -> batches -> users (`INV-CMP-10`).
    const [lockedComplaint] = await tx
      .select({
        id: complaints.id,
        orderId: complaints.orderId,
        customerId: complaints.customerId,
        status: complaints.status,
      })
      .from(complaints)
      .where(eq(complaints.id, complaintId))
      .for("update");

    if (!lockedComplaint) {
      throw new NotFoundException({
        code: API_ERROR_CODES.COMPLAINT_NOT_FOUND,
        detail: MESSAGES.COMPLAINTS.NOT_FOUND,
      });
    }

    if (lockedComplaint.status !== ComplaintStatus.TRIAGED) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.COMPLAINT_INVALID_STATUS_TRANSITION,
        detail: MESSAGES.COMPLAINTS.INVALID_RESOLVE_STATUS_TRANSITION,
      });
    }

    const [lockedOrder] = await tx
      .select({
        id: orders.id,
        customerId: orders.customerId,
        receiverName: orders.receiverName,
        receiverPhone: orders.receiverPhone,
        shippingAddress: orders.shippingAddress,
        shippingDistanceKm: orders.shippingDistanceKm,
        totalAmount: orders.totalAmount,
        loyaltyPointsUsed: orders.loyaltyPointsUsed,
        paymentMethod: orders.paymentMethod,
        paymentStatus: orders.paymentStatus,
      })
      .from(orders)
      .where(eq(orders.id, lockedComplaint.orderId))
      .for("update");

    if (!lockedOrder) {
      throw new NotFoundException({
        code: API_ERROR_CODES.ORDER_NOT_FOUND,
        detail: MESSAGES.ORDERS.NOT_FOUND,
      });
    }

    const normalizedNote =
      input.resolutionNote && input.resolutionNote.length > 0
        ? input.resolutionNote
        : null;

    let resolvedRefundChannel: ComplaintRefundChannel | null = null;
    let resolvedRefundAmountVnd: number | null = null;
    let replacementOrderId: string | null = null;

    if (input.resolution === ComplaintResolution.REFUND) {
      const refundResult = await this.executeRefundResolution(
        tx,
        actorId,
        lockedOrder,
        input,
        now,
      );
      resolvedRefundChannel = refundResult.refundChannel;
      resolvedRefundAmountVnd = refundResult.refundAmountVnd;
    } else {
      replacementOrderId = await this.executeReplacementResolution(
        tx,
        lockedOrder,
        input,
        now,
      );
    }

    await tx
      .update(complaints)
      .set({
        status: ComplaintStatus.APPROVED,
        resolution: input.resolution,
        resolvedBy: actorId,
        resolvedAt: now,
        resolutionNote: normalizedNote,
        refundChannel: resolvedRefundChannel,
        refundAmountVnd: resolvedRefundAmountVnd,
        replacementOrderId,
        updatedAt: now,
      })
      .where(eq(complaints.id, complaintId));
  }

  private async executeRefundResolution(
    tx: DrizzleTx,
    actorId: string,
    lockedOrder: {
      readonly id: string;
      readonly customerId: string;
      readonly totalAmount: number;
      readonly loyaltyPointsUsed: number;
      readonly paymentMethod: PaymentMethod;
      readonly paymentStatus: PaymentStatus;
    },
    input: ResolveComplaintInput,
    now: Date,
  ): Promise<{
    readonly refundChannel: ComplaintRefundChannel;
    readonly refundAmountVnd: number;
  }> {
    if (lockedOrder.paymentStatus !== PaymentStatus.PAID) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.COMPLAINT_ORDER_NOT_PAID,
        detail: MESSAGES.COMPLAINTS.ORDER_NOT_PAID,
      });
    }

    const refundAmountVnd = input.refundAmountVnd ?? lockedOrder.totalAmount;
    if (refundAmountVnd < 1 || refundAmountVnd > lockedOrder.totalAmount) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.COMPLAINT_REFUND_AMOUNT_INVALID,
        detail: MESSAGES.COMPLAINTS.REFUND_AMOUNT_INVALID,
      });
    }

    const refundChannel = input.refundChannel!;

    if (refundChannel === ComplaintRefundChannel.BANK_TRANSFER) {
      const normalizedRef =
        input.referenceCode && input.referenceCode.length > 0
          ? input.referenceCode
          : null;

      await tx.insert(payments).values({
        orderId: lockedOrder.id,
        amount: refundAmountVnd,
        paymentMethod: lockedOrder.paymentMethod,
        status: PaymentStatus.REFUNDED,
        transactionType: PaymentTransactionType.REFUND,
        referenceCode: normalizedRef,
        verifiedBy: actorId,
        paidAt: now,
      });

      if (refundAmountVnd === lockedOrder.totalAmount) {
        await tx
          .update(orders)
          .set({
            paymentStatus: PaymentStatus.REFUNDED,
            updatedAt: now,
          })
          .where(eq(orders.id, lockedOrder.id));

        if (lockedOrder.loyaltyPointsUsed > 0) {
          await this.creditCustomerLoyaltyPoints(
            tx,
            lockedOrder.customerId,
            lockedOrder.loyaltyPointsUsed,
            now,
          );
        }
      }
    } else {
      await this.creditCustomerLoyaltyPoints(
        tx,
        lockedOrder.customerId,
        refundAmountVnd,
        now,
      );
    }

    return { refundChannel, refundAmountVnd };
  }

  private async creditCustomerLoyaltyPoints(
    tx: DrizzleTx,
    customerId: string,
    points: number,
    now: Date,
  ): Promise<void> {
    await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, customerId))
      .for("update");

    await tx
      .update(users)
      .set({
        rewardPoints: sql`${users.rewardPoints} + ${points}`,
        updatedAt: now,
      })
      .where(eq(users.id, customerId));
  }

  private async executeReplacementResolution(
    tx: DrizzleTx,
    lockedOrder: {
      readonly id: string;
      readonly customerId: string;
      readonly receiverName: string;
      readonly receiverPhone: string;
      readonly shippingAddress: string;
      readonly shippingDistanceKm: string;
    },
    input: ResolveComplaintInput,
    now: Date,
  ): Promise<string> {
    const originalItems = await tx
      .select({
        productId: orderItems.productId,
        quantity: orderItems.quantity,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, lockedOrder.id));

    const originalCentsByProduct = new Map<string, number>();
    for (const row of originalItems) {
      originalCentsByProduct.set(
        row.productId,
        (originalCentsByProduct.get(row.productId) ?? 0) +
          toQuantityCents(row.quantity),
      );
    }

    const replacementItems: FefoAllocationItemInput[] = [];
    if (input.items === undefined) {
      for (const [productId, quantityCents] of originalCentsByProduct) {
        replacementItems.push({ productId, quantityCents });
      }
    } else {
      for (const item of input.items) {
        const originalCents = originalCentsByProduct.get(item.productId);
        const requestedCents = toQuantityCents(item.quantity);
        if (
          originalCents === undefined ||
          requestedCents <= 0 ||
          requestedCents > originalCents
        ) {
          throw new UnprocessableEntityException({
            code: API_ERROR_CODES.COMPLAINT_REPLACEMENT_ITEMS_INVALID,
            detail: MESSAGES.COMPLAINTS.REPLACEMENT_ITEMS_INVALID,
          });
        }
        replacementItems.push({
          productId: item.productId,
          quantityCents: requestedCents,
        });
      }
    }

    if (replacementItems.length === 0) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.COMPLAINT_REPLACEMENT_ITEMS_INVALID,
        detail: MESSAGES.COMPLAINTS.REPLACEMENT_ITEMS_INVALID,
      });
    }

    const candidateBatches = await lockCandidateSellableBatches(
      tx,
      replacementItems.map((item) => item.productId),
      now,
    );

    const planOutcome = planFefoAllocations(replacementItems, candidateBatches);
    if (!planOutcome.ok) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.INSUFFICIENT_STOCK,
        detail: MESSAGES.ORDERS.INSUFFICIENT_STOCK,
        invalidParams: planOutcome.shortages.map((shortage) => ({
          name: "items",
          code: API_ERROR_CODES.INSUFFICIENT_STOCK,
          reason: MESSAGES.ORDERS.INSUFFICIENT_STOCK,
          params: shortage,
        })),
      });
    }

    const orderCode = buildOrderCode(formatOrderCalendarDateVn(now));
    const [replacementOrder] = await tx
      .insert(orders)
      .values({
        orderCode,
        customerId: lockedOrder.customerId,
        receiverName: lockedOrder.receiverName,
        receiverPhone: lockedOrder.receiverPhone,
        shippingAddress: lockedOrder.shippingAddress,
        shippingDistanceKm: lockedOrder.shippingDistanceKm,
        shippingFee: 0,
        subtotal: 0,
        discountAmount: 0,
        loyaltyPointsUsed: 0,
        totalAmount: 0,
        paymentMethod: PaymentMethod.COD,
        paymentStatus: PaymentStatus.PAID,
        orderStatus: OrderStatus.CONFIRMED,
        reservationExpiresAt: null,
      })
      .returning({ id: orders.id });

    if (!replacementOrder) {
      throw new Error("Failed to insert replacement order record.");
    }

    const insertedItems = await tx
      .insert(orderItems)
      .values(
        replacementItems.map((item) => ({
          orderId: replacementOrder.id,
          productId: item.productId,
          quantity: formatQuantityFromCents(item.quantityCents),
          unitPrice: 0,
        })),
      )
      .returning({
        id: orderItems.id,
        productId: orderItems.productId,
      });

    const insertedItemIdByProduct = new Map(
      insertedItems.map((row) => [row.productId, row.id]),
    );

    await applyFefoAllocations(
      tx,
      planOutcome.plan,
      insertedItemIdByProduct,
      now,
    );

    return replacementOrder.id;
  }

  private async findStaffComplaintById(
    complaintId: string,
  ): Promise<StaffComplaintProjection> {
    const [row] = await this.db
      .select(STAFF_COMPLAINT_SELECT)
      .from(complaints)
      .innerJoin(orders, eq(complaints.orderId, orders.id))
      .innerJoin(users, eq(complaints.customerId, users.id))
      .where(eq(complaints.id, complaintId))
      .limit(1);

    if (!row) {
      throw new NotFoundException({
        code: API_ERROR_CODES.COMPLAINT_NOT_FOUND,
        detail: MESSAGES.COMPLAINTS.NOT_FOUND,
      });
    }

    return toStaffComplaintProjection(row);
  }
}

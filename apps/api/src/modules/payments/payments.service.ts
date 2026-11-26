import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  lte,
  or,
  type SQL,
} from "drizzle-orm";
import {
  API_ERROR_CODES,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
} from "@greenroots/shared";
import { MESSAGES } from "@/common/constants/messages.constant";
import type { PaginationMetaDto } from "@/common/dto/api-response.dto";
import { buildPaginationMeta } from "@/common/utils/api-response.util";
import { escapeLikePattern } from "@/common/utils/query.util";
import {
  DATABASE_CONNECTION,
  type DrizzleDB,
  type DrizzleTx,
} from "@/database/database.module";
import { orders, payments, subscriptions, users } from "@/database/schemas";
import type { ListPaymentsQuery, PaymentLedgerItemProjection } from "./dto";

const LEDGER_ITEM_SELECT = {
  id: payments.id,
  orderId: payments.orderId,
  orderCode: orders.orderCode,
  subscriptionId: payments.subscriptionId,
  subscriptionCode: subscriptions.subscriptionCode,
  amountVnd: payments.amount,
  paymentMethod: payments.paymentMethod,
  status: payments.status,
  transactionType: payments.transactionType,
  payosOrderCode: payments.orderCode,
  referenceCode: payments.referenceCode,
  verifiedBy: payments.verifiedBy,
  verifiedByName: users.fullName,
  paidAt: payments.paidAt,
  createdAt: payments.createdAt,
  updatedAt: payments.updatedAt,
} as const;

type RawLedgerRow = {
  id: string;
  orderId: string | null;
  orderCode: string | null;
  subscriptionId: string | null;
  subscriptionCode: string | null;
  amountVnd: number;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  transactionType: PaymentTransactionType;
  payosOrderCode: number | null;
  referenceCode: string | null;
  verifiedBy: string | null;
  verifiedByName: string | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toPaymentLedgerItemProjection(
  row: RawLedgerRow,
): PaymentLedgerItemProjection {
  return {
    id: row.id,
    orderId: row.orderId,
    orderCode: row.orderCode ?? null,
    subscriptionId: row.subscriptionId,
    subscriptionCode: row.subscriptionCode ?? null,
    amountVnd: row.amountVnd,
    paymentMethod: row.paymentMethod,
    status: row.status,
    transactionType: row.transactionType,
    payosOrderCode: row.payosOrderCode,
    referenceCode: row.referenceCode,
    verifiedBy: row.verifiedBy,
    verifiedByName: row.verifiedByName ?? null,
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isCodOrderPayment(row: {
  orderId: string | null;
  paymentMethod: PaymentMethod;
  transactionType: PaymentTransactionType;
}): row is {
  orderId: string;
  paymentMethod: PaymentMethod;
  transactionType: PaymentTransactionType;
} {
  return (
    row.orderId !== null &&
    row.paymentMethod === PaymentMethod.COD &&
    row.transactionType === PaymentTransactionType.PAYMENT
  );
}

/**
 * Staff payment ledger queries and atomic Cash-on-Delivery (COD) confirmation (`ADR-0043`).
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DrizzleDB,
  ) {}

  /**
   * Lists paginated, filtered, and hydrated payment transactions for authorized staff (`INV-5`).
   *
   * @param query Validated pagination, filter, date range, and search parameters.
   * @returns Sanitized payment ledger entries and pagination metadata.
   */
  async listPayments(query: ListPaymentsQuery): Promise<{
    items: PaymentLedgerItemProjection[];
    meta: PaginationMetaDto;
  }> {
    const conditions: SQL[] = [];

    if (query.status !== undefined) {
      conditions.push(eq(payments.status, query.status));
    }
    if (query.paymentMethod !== undefined) {
      conditions.push(eq(payments.paymentMethod, query.paymentMethod));
    }
    if (query.transactionType !== undefined) {
      conditions.push(eq(payments.transactionType, query.transactionType));
    }
    if (query.orderId !== undefined) {
      conditions.push(eq(payments.orderId, query.orderId));
    }
    if (query.subscriptionId !== undefined) {
      conditions.push(eq(payments.subscriptionId, query.subscriptionId));
    }
    if (query.from !== undefined) {
      conditions.push(gte(payments.createdAt, new Date(query.from)));
    }
    if (query.to !== undefined) {
      conditions.push(lte(payments.createdAt, new Date(query.to)));
    }
    if (query.search !== undefined) {
      const pattern = `%${escapeLikePattern(query.search)}%`;
      const searchCondition = or(
        ilike(orders.orderCode, pattern),
        ilike(subscriptions.subscriptionCode, pattern),
        ilike(payments.referenceCode, pattern),
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const countBase = this.db.select({ total: count() }).from(payments);
    const [countRow] = await (
      query.search !== undefined
        ? countBase
            .leftJoin(orders, eq(payments.orderId, orders.id))
            .leftJoin(
              subscriptions,
              eq(payments.subscriptionId, subscriptions.id),
            )
        : countBase
    ).where(whereClause);

    const total = Number(countRow?.total ?? 0);
    const meta = buildPaginationMeta(total, query.page, query.limit);
    const offset = (query.page - 1) * query.limit;

    if (total === 0 || offset >= total) {
      return { items: [], meta };
    }

    const rows = await this.db
      .select(LEDGER_ITEM_SELECT)
      .from(payments)
      .leftJoin(orders, eq(payments.orderId, orders.id))
      .leftJoin(subscriptions, eq(payments.subscriptionId, subscriptions.id))
      .leftJoin(users, eq(payments.verifiedBy, users.id))
      .where(whereClause)
      .orderBy(desc(payments.createdAt), desc(payments.id))
      .limit(query.limit)
      .offset(offset);

    return {
      items: rows.map(toPaymentLedgerItemProjection),
      meta,
    };
  }

  /**
   * Atomically confirms a pending COD payment for a `shipping` or `delivered` order (`INV-2`, `INV-3`, `INV-4`).
   *
   * @param paymentId Target payment UUIDv7 identifier.
   * @param actorUserId Authenticated staff user UUIDv7 confirming COD collection.
   * @returns Hydrated payment ledger projection.
   */
  async confirmCod(
    paymentId: string,
    actorUserId: string,
  ): Promise<PaymentLedgerItemProjection> {
    const [lookup] = await this.db
      .select({
        id: payments.id,
        orderId: payments.orderId,
        paymentMethod: payments.paymentMethod,
        transactionType: payments.transactionType,
      })
      .from(payments)
      .where(eq(payments.id, paymentId))
      .limit(1);

    if (!lookup) {
      throw new NotFoundException({
        code: API_ERROR_CODES.PAYMENT_NOT_FOUND,
        detail: MESSAGES.PAYMENTS.RECORD_NOT_FOUND,
      });
    }

    if (!isCodOrderPayment(lookup)) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.PAYMENT_COD_NOT_ELIGIBLE,
        detail: MESSAGES.PAYMENTS.COD_NOT_ELIGIBLE,
      });
    }

    const orderId = lookup.orderId;

    return this.db.transaction(async (tx) => {
      // Lock `orders` before `payments` consistently to prevent deadlocks with cancel/expiry/webhook flows (`ADR-0043`).
      const [lockedOrder] = await tx
        .select({
          id: orders.id,
          orderStatus: orders.orderStatus,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .for("update");

      if (!lockedOrder) {
        throw new NotFoundException({
          code: API_ERROR_CODES.PAYMENT_NOT_FOUND,
          detail: MESSAGES.PAYMENTS.RECORD_NOT_FOUND,
        });
      }

      const [lockedPayment] = await tx
        .select({
          id: payments.id,
          orderId: payments.orderId,
          amount: payments.amount,
          paymentMethod: payments.paymentMethod,
          status: payments.status,
          transactionType: payments.transactionType,
        })
        .from(payments)
        .where(eq(payments.id, paymentId))
        .for("update");

      if (!lockedPayment) {
        throw new NotFoundException({
          code: API_ERROR_CODES.PAYMENT_NOT_FOUND,
          detail: MESSAGES.PAYMENTS.RECORD_NOT_FOUND,
        });
      }

      if (!isCodOrderPayment(lockedPayment)) {
        throw new UnprocessableEntityException({
          code: API_ERROR_CODES.PAYMENT_COD_NOT_ELIGIBLE,
          detail: MESSAGES.PAYMENTS.COD_NOT_ELIGIBLE,
        });
      }

      if (lockedPayment.status === PaymentStatus.PAID) {
        return this.getHydratedLedgerItem(tx, lockedPayment.id);
      }

      if (lockedPayment.status !== PaymentStatus.PENDING) {
        throw new UnprocessableEntityException({
          code: API_ERROR_CODES.PAYMENT_INVALID_STATUS_TRANSITION,
          detail: MESSAGES.PAYMENTS.INVALID_STATUS_TRANSITION,
        });
      }

      if (
        lockedOrder.orderStatus !== OrderStatus.SHIPPING &&
        lockedOrder.orderStatus !== OrderStatus.DELIVERED
      ) {
        throw new UnprocessableEntityException({
          code: API_ERROR_CODES.PAYMENT_COD_NOT_ELIGIBLE,
          detail: MESSAGES.PAYMENTS.COD_NOT_ELIGIBLE,
        });
      }

      const now = new Date();

      await tx
        .update(payments)
        .set({
          status: PaymentStatus.PAID,
          verifiedBy: actorUserId,
          paidAt: now,
          updatedAt: now,
        })
        .where(eq(payments.id, lockedPayment.id));

      await tx
        .update(orders)
        .set({
          paymentStatus: PaymentStatus.PAID,
          updatedAt: now,
        })
        .where(eq(orders.id, lockedOrder.id));

      this.logger.log(
        `Confirmed COD payment paymentId=${lockedPayment.id} orderId=${lockedOrder.id} actorId=${actorUserId} amountVnd=${lockedPayment.amount}`,
      );

      return this.getHydratedLedgerItem(tx, lockedPayment.id);
    });
  }

  private async getHydratedLedgerItem(
    tx: DrizzleTx,
    paymentId: string,
  ): Promise<PaymentLedgerItemProjection> {
    const [row] = await tx
      .select(LEDGER_ITEM_SELECT)
      .from(payments)
      .leftJoin(orders, eq(payments.orderId, orders.id))
      .leftJoin(subscriptions, eq(payments.subscriptionId, subscriptions.id))
      .leftJoin(users, eq(payments.verifiedBy, users.id))
      .where(eq(payments.id, paymentId))
      .limit(1);

    if (!row) {
      throw new NotFoundException({
        code: API_ERROR_CODES.PAYMENT_NOT_FOUND,
        detail: MESSAGES.PAYMENTS.RECORD_NOT_FOUND,
      });
    }

    return toPaymentLedgerItemProjection(row);
  }
}

import { randomBytes } from "node:crypto";
import {
  BadGatewayException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
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
} from "drizzle-orm";
import {
  API_ERROR_CODES,
  BUSINESS_RULES,
  DeliveryDay,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
  SubscriptionStatus,
  UserStatus,
} from "@greenroots/shared";
import { env } from "@/common/config/env.config";
import { PG_ERROR_CODE } from "@/common/constants/error.constant";
import { MESSAGES } from "@/common/constants/messages.constant";
import type { PaginationMetaDto } from "@/common/dto/api-response.dto";
import { buildPaginationMeta } from "@/common/utils/api-response.util";
import { extractDatabaseErrorDetails } from "@/common/utils/error.util";
import { formatVnCalendarDate } from "@/common/utils/time.util";
import {
  DATABASE_CONNECTION,
  type DrizzleDB,
} from "@/database/database.module";
import {
  payments,
  subscriptionPlans,
  subscriptions,
  users,
  type Subscription,
} from "@/database/schemas";
import { FarmSettingsService } from "@/modules/farms/farm-settings.service";
import { ShippingService } from "@/modules/orders/shipping/shipping.service";
import {
  PAYMENT_DRIVER_TOKEN,
  PAYMENT_ORDER_CODE_UIDX,
} from "@/modules/payments/payments.constant";
import type { PaymentDriver } from "@/modules/payments/payments.interface";
import {
  cancelPaymentLinksBestEffort,
  generatePayosOrderCode,
  type PayosLinkCancelTarget,
} from "@/modules/payments/payos.util";
import { AddressService } from "@/modules/users/address.service";
import type {
  CreateSubscriptionCheckoutInput,
  ListMySubscriptionsQuery,
  SubscriptionProjection,
} from "./dto";
import {
  CROCKFORD_BASE32_ALPHABET,
  SUBSCRIPTION_CODE_MAX_GENERATION_ATTEMPTS,
  SUBSCRIPTION_CODE_PREFIX,
  SUBSCRIPTION_CODE_RANDOM_LENGTH,
  SUBSCRIPTION_CODE_UIDX,
  SUBSCRIPTION_EXPIRY_SWEEP_BATCH_SIZE,
} from "./subscriptions.constant";

const SUBSCRIPTION_COLUMNS = {
  id: subscriptions.id,
  subscriptionCode: subscriptions.subscriptionCode,
  planId: subscriptions.planId,
  planName: subscriptions.planName,
  price: subscriptions.price,
  totalDeliveries: subscriptions.totalDeliveries,
  weightPerDeliveryKg: subscriptions.weightPerDeliveryKg,
  basketDescription: subscriptions.basketDescription,
  deliveryDay: subscriptions.deliveryDay,
  remainingDeliveries: subscriptions.remainingDeliveries,
  status: subscriptions.status,
  receiverName: subscriptions.receiverName,
  receiverPhone: subscriptions.receiverPhone,
  shippingAddress: subscriptions.shippingAddress,
  shippingDistanceKm: subscriptions.shippingDistanceKm,
  shippingFeePerDelivery: subscriptions.shippingFeePerDelivery,
  startDate: subscriptions.startDate,
  endDate: subscriptions.endDate,
  reservationExpiresAt: subscriptions.reservationExpiresAt,
  createdAt: subscriptions.createdAt,
  updatedAt: subscriptions.updatedAt,
} as const;

type SubscriptionRow = Pick<Subscription, keyof typeof SUBSCRIPTION_COLUMNS>;

function matchesDeliveryDay(
  utcDayOfWeek: number,
  deliveryDay: DeliveryDay,
): boolean {
  if (deliveryDay === DeliveryDay.TUESDAY) {
    return utcDayOfWeek === 2;
  }
  if (deliveryDay === DeliveryDay.FRIDAY) {
    return utcDayOfWeek === 5;
  }
  return utcDayOfWeek === 2 || utcDayOfWeek === 5;
}

function formatUtcCalendarDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Computes the server-authoritative `startDate` (next matching `deliveryDay` strictly `>= tomorrow` in `Asia/Ho_Chi_Minh`)
 * and `endDate` (the `totalDeliveries`-th delivery date).
 *
 * @param deliveryDay Customer-selected delivery cadence (`tuesday`, `friday`, or `both`).
 * @param totalDeliveries Total prepaid deliveries from the subscription plan (`>= 1`).
 * @param now Reference timestamp (defaults to `new Date()`).
 * @returns ISO `YYYY-MM-DD` schedule bounds and `YYYYMMDD` date stamp for `subscriptionCode`.
 */
export function calculateSubscriptionSchedule(
  deliveryDay: DeliveryDay,
  totalDeliveries: number,
  now: Date = new Date(),
): { startDate: string; endDate: string; yyyymmdd: string } {
  const vnToday = formatVnCalendarDate(now);
  const [yearStr, monthStr, dayStr] = vnToday.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  // Use UTC calendar arithmetic on the Asia/Ho_Chi_Minh date tuple to avoid host-TZ/DST drift.
  const cursor = new Date(Date.UTC(year, month - 1, day + 1));
  while (!matchesDeliveryDay(cursor.getUTCDay(), deliveryDay)) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const startDate = formatUtcCalendarDate(cursor);

  let remaining = totalDeliveries - 1;
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (matchesDeliveryDay(cursor.getUTCDay(), deliveryDay)) {
      remaining -= 1;
    }
  }
  const endDate = formatUtcCalendarDate(cursor);

  return {
    startDate,
    endDate,
    yyyymmdd: vnToday.replaceAll("-", ""),
  };
}

/**
 * Orchestrates prepaid subscription checkout (`ADR-0041`) and customer subscription read projections.
 */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DrizzleDB,
    private readonly addressService: AddressService,
    private readonly farmSettingsService: FarmSettingsService,
    private readonly shippingService: ShippingService,
    @Inject(PAYMENT_DRIVER_TOKEN)
    private readonly paymentDriver: PaymentDriver,
  ) {}

  /**
   * Initiates a prepaid subscription checkout using the two-phase PayOS pattern (`ADR-0041`, `ADR-0042`).
   *
   * @param sub Authenticated customer UUID from JWT `sub`.
   * @param input Validated subscription checkout payload.
   * @returns Created `pending_payment` subscription projection with PayOS `paymentUrl`.
   */
  async createSubscriptionCheckout(
    sub: string,
    input: CreateSubscriptionCheckoutInput,
  ): Promise<SubscriptionProjection> {
    const settings = await this.farmSettingsService.getSettings();
    if (!settings.isPayosEnabled) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.SUBSCRIPTION_PAYOS_DISABLED,
        detail: MESSAGES.SUBSCRIPTIONS.PAYOS_DISABLED,
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
      { isSubscription: true },
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

    const shippingFeePerDelivery = shippingQuote.feeVnd;
    const tx1 = await this.runCheckoutReservationWithRetry(sub, input, {
      receiverName: resolvedAddress.receiverName,
      receiverPhone: resolvedAddress.phoneNumber,
      formattedAddress: resolvedAddress.formattedAddress,
      roadDistanceKm: shippingQuote.roadDistanceKm,
      shippingFeePerDelivery,
      userAddressId: resolvedAddress.id,
    });

    const storefrontOrigin = env.STOREFRONT_URL;
    const returnUrl = `${storefrontOrigin}/subscriptions/${tx1.projection.id}?payment=success`;
    const cancelUrl = `${storefrontOrigin}/subscriptions/${tx1.projection.id}?payment=cancelled`;
    const expiredAt = Math.floor(tx1.reservationExpiresAt.getTime() / 1000);

    try {
      const link = await this.paymentDriver.createPaymentLink({
        orderCode: tx1.paymentOrderCode,
        amountVnd: tx1.projection.totalAmountVnd,
        description: tx1.projection.subscriptionCode,
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
        `PayOS createPaymentLink failed for subscriptionId=${tx1.projection.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      try {
        await this.compensateFailedPayosCheckout(
          tx1.projection.id,
          tx1.paymentId,
        );
      } catch (compError) {
        this.logger.error(
          `Compensation failed for subscriptionId=${tx1.projection.id}: ${compError instanceof Error ? compError.message : String(compError)}`,
        );
      }
      throw new BadGatewayException({
        code: API_ERROR_CODES.PAYMENT_GATEWAY_ERROR,
        detail: MESSAGES.PAYMENTS.GATEWAY_ERROR,
      });
    }
  }

  /**
   * Cancels up to `SUBSCRIPTION_EXPIRY_SWEEP_BATCH_SIZE` expired `pending_payment`
   * subscriptions (`ADR-0041`, `INV-EXP-3`), marking their pending `payments` as `cancelled`,
   * then cancels active PayOS links post-commit (`INV-EXP-1`, `INV-EXP-2`).
   *
   * @param now Reference timestamp for expiration comparison.
   * @returns Number of expired subscriptions cancelled in this sweep batch.
   */
  async expireStaleReservations(now: Date = new Date()): Promise<number> {
    let expiredCount = 0;
    const cancelledPayosTargets: PayosLinkCancelTarget[] = [];

    // Claim and cancel one expired subscription per short transaction so lock order stays subscriptions -> payments.
    for (let i = 0; i < SUBSCRIPTION_EXPIRY_SWEEP_BATCH_SIZE; i += 1) {
      const result = await this.db.transaction(async (tx) => {
        const [subRow] = await tx
          .select({ id: subscriptions.id })
          .from(subscriptions)
          .where(
            and(
              eq(subscriptions.status, SubscriptionStatus.PENDING_PAYMENT),
              isNotNull(subscriptions.reservationExpiresAt),
              lte(subscriptions.reservationExpiresAt, now),
            ),
          )
          .orderBy(
            asc(subscriptions.reservationExpiresAt),
            asc(subscriptions.id),
          )
          .limit(1)
          .for("update", { skipLocked: true });

        if (!subRow) {
          return null;
        }

        await tx
          .update(subscriptions)
          .set({
            status: SubscriptionStatus.CANCELLED,
            reservationExpiresAt: null,
            updatedAt: now,
          })
          .where(eq(subscriptions.id, subRow.id));

        const cancelledPayments = await tx
          .update(payments)
          .set({
            status: PaymentStatus.CANCELLED,
            updatedAt: now,
          })
          .where(
            and(
              eq(payments.subscriptionId, subRow.id),
              eq(payments.status, PaymentStatus.PENDING),
              eq(payments.transactionType, PaymentTransactionType.PAYMENT),
            ),
          )
          .returning({ orderCode: payments.orderCode });

        return {
          subscriptionId: subRow.id,
          cancelledPayosOrderCode:
            cancelledPayments.find((row) => row.orderCode !== null)
              ?.orderCode ?? null,
        };
      });

      if (!result) {
        break;
      }

      expiredCount += 1;
      if (result.cancelledPayosOrderCode !== null) {
        cancelledPayosTargets.push({
          orderCode: result.cancelledPayosOrderCode,
          referenceId: result.subscriptionId,
        });
      }
    }

    await cancelPaymentLinksBestEffort(
      this.paymentDriver,
      this.logger,
      cancelledPayosTargets,
      "Subscription reservation expired",
    );

    return expiredCount;
  }

  /**
   * Lists subscriptions owned by the authenticated customer ordered by `createdAt DESC, id DESC`.
   *
   * @param sub Authenticated customer UUID from JWT `sub`.
   * @param query Validated pagination and optional status filter.
   * @returns Paginated subscription projections and pagination metadata.
   */
  async listMySubscriptions(
    sub: string,
    query: ListMySubscriptionsQuery,
  ): Promise<{ items: SubscriptionProjection[]; meta: PaginationMetaDto }> {
    const conditions = [eq(subscriptions.customerId, sub)];
    if (query.status !== undefined) {
      conditions.push(eq(subscriptions.status, query.status));
    }

    const whereClause = and(...conditions);
    const offset = (query.page - 1) * query.limit;

    const [totalRows, rows] = await Promise.all([
      this.db.select({ total: count() }).from(subscriptions).where(whereClause),
      this.db
        .select(SUBSCRIPTION_COLUMNS)
        .from(subscriptions)
        .where(whereClause)
        .orderBy(desc(subscriptions.createdAt), desc(subscriptions.id))
        .limit(query.limit)
        .offset(offset),
    ]);

    const pendingIds = rows
      .filter((row) => row.status === SubscriptionStatus.PENDING_PAYMENT)
      .map((row) => row.id);

    const paymentUrlsBySubId = new Map<string, string | null>();
    if (pendingIds.length > 0) {
      const paymentRows = await this.db
        .select({
          subscriptionId: payments.subscriptionId,
          paymentUrl: payments.paymentUrl,
        })
        .from(payments)
        .where(
          and(
            inArray(payments.subscriptionId, pendingIds),
            eq(payments.transactionType, PaymentTransactionType.PAYMENT),
            eq(payments.status, PaymentStatus.PENDING),
          ),
        )
        .orderBy(desc(payments.createdAt), desc(payments.id));

      for (const paymentRow of paymentRows) {
        if (
          paymentRow.subscriptionId &&
          !paymentUrlsBySubId.has(paymentRow.subscriptionId)
        ) {
          paymentUrlsBySubId.set(
            paymentRow.subscriptionId,
            paymentRow.paymentUrl,
          );
        }
      }
    }

    const total = Number(totalRows[0]?.total ?? 0);
    return {
      items: rows.map((row) =>
        this.toProjection(
          row,
          row.status === SubscriptionStatus.PENDING_PAYMENT
            ? (paymentUrlsBySubId.get(row.id) ?? null)
            : null,
        ),
      ),
      meta: buildPaginationMeta(total, query.page, query.limit),
    };
  }

  /**
   * Returns a single subscription owned by the authenticated customer (`404` when missing or foreign).
   *
   * @param sub Authenticated customer UUID from JWT `sub`.
   * @param subscriptionId Subscription UUIDv7 identifier.
   * @returns Closed subscription projection.
   */
  async getMySubscriptionById(
    sub: string,
    subscriptionId: string,
  ): Promise<SubscriptionProjection> {
    const [row] = await this.db
      .select(SUBSCRIPTION_COLUMNS)
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.id, subscriptionId),
          eq(subscriptions.customerId, sub),
        ),
      )
      .limit(1);

    if (!row) {
      throw new NotFoundException({
        code: API_ERROR_CODES.SUBSCRIPTION_NOT_FOUND,
        detail: MESSAGES.SUBSCRIPTIONS.NOT_FOUND,
      });
    }

    let paymentUrl: string | null = null;
    if (row.status === SubscriptionStatus.PENDING_PAYMENT) {
      const [paymentRow] = await this.db
        .select({ paymentUrl: payments.paymentUrl })
        .from(payments)
        .where(
          and(
            eq(payments.subscriptionId, row.id),
            eq(payments.transactionType, PaymentTransactionType.PAYMENT),
            eq(payments.status, PaymentStatus.PENDING),
          ),
        )
        .orderBy(desc(payments.createdAt), desc(payments.id))
        .limit(1);
      paymentUrl = paymentRow?.paymentUrl ?? null;
    }

    return this.toProjection(row, paymentUrl);
  }

  private async runCheckoutReservationWithRetry(
    sub: string,
    input: CreateSubscriptionCheckoutInput,
    snapshot: {
      receiverName: string;
      receiverPhone: string;
      formattedAddress: string;
      roadDistanceKm: number;
      shippingFeePerDelivery: number;
      userAddressId: string;
    },
  ) {
    for (
      let attempt = 0;
      attempt < SUBSCRIPTION_CODE_MAX_GENERATION_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await this.executeCheckoutReservationTx(sub, input, snapshot);
      } catch (error) {
        const dbError = extractDatabaseErrorDetails(error);
        const isCodeCollision =
          dbError.code === PG_ERROR_CODE.UNIQUE_VIOLATION &&
          (dbError.constraint === SUBSCRIPTION_CODE_UIDX ||
            dbError.constraint === PAYMENT_ORDER_CODE_UIDX);
        if (
          isCodeCollision &&
          attempt < SUBSCRIPTION_CODE_MAX_GENERATION_ATTEMPTS - 1
        ) {
          continue;
        }
        if (isCodeCollision) {
          throw new InternalServerErrorException({
            code: API_ERROR_CODES.INTERNAL_SERVER_ERROR,
            detail: MESSAGES.SUBSCRIPTIONS.CODE_GENERATION_EXHAUSTED,
          });
        }
        throw error;
      }
    }

    throw new InternalServerErrorException({
      code: API_ERROR_CODES.INTERNAL_SERVER_ERROR,
      detail: MESSAGES.SUBSCRIPTIONS.CODE_GENERATION_EXHAUSTED,
    });
  }

  private async executeCheckoutReservationTx(
    sub: string,
    input: CreateSubscriptionCheckoutInput,
    snapshot: {
      receiverName: string;
      receiverPhone: string;
      formattedAddress: string;
      roadDistanceKm: number;
      shippingFeePerDelivery: number;
      userAddressId: string;
    },
  ) {
    const now = new Date();
    const reservationExpiresAt = new Date(
      now.getTime() + BUSINESS_RULES.ORDER_PAYMENT_TIMEOUT_MINUTES * 60_000,
    );

    return this.db.transaction(async (tx) => {
      // Lock the customer row first to serialize the 3-pending-subscription cap under READ COMMITTED (`ADR-0041`).
      const [user] = await tx
        .select({ id: users.id, status: users.status })
        .from(users)
        .where(and(eq(users.id, sub), isNull(users.deletedAt)))
        .for("update");

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

      const [pendingRow] = await tx
        .select({ total: count() })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.customerId, sub),
            eq(subscriptions.status, SubscriptionStatus.PENDING_PAYMENT),
          ),
        );

      if (
        Number(pendingRow?.total ?? 0) >=
        BUSINESS_RULES.MAX_PENDING_SUBSCRIPTIONS_PER_CUSTOMER
      ) {
        throw new UnprocessableEntityException({
          code: API_ERROR_CODES.SUBSCRIPTION_PENDING_LIMIT_REACHED,
          detail: MESSAGES.SUBSCRIPTIONS.PENDING_LIMIT_REACHED,
        });
      }

      const [plan] = await tx
        .select({
          id: subscriptionPlans.id,
          name: subscriptionPlans.name,
          price: subscriptionPlans.price,
          totalDeliveries: subscriptionPlans.totalDeliveries,
          weightPerDeliveryKg: subscriptionPlans.weightPerDeliveryKg,
          basketDescription: subscriptionPlans.basketDescription,
          isActive: subscriptionPlans.isActive,
        })
        .from(subscriptionPlans)
        .where(
          and(
            eq(subscriptionPlans.id, input.planId),
            isNull(subscriptionPlans.deletedAt),
          ),
        )
        .limit(1);

      if (!plan) {
        throw new NotFoundException({
          code: API_ERROR_CODES.SUBSCRIPTION_PLAN_NOT_FOUND,
          detail: MESSAGES.SUBSCRIPTION_PLANS.NOT_FOUND,
        });
      }

      if (!plan.isActive) {
        throw new UnprocessableEntityException({
          code: API_ERROR_CODES.SUBSCRIPTION_PLAN_INACTIVE,
          detail: MESSAGES.SUBSCRIPTIONS.PLAN_INACTIVE,
        });
      }

      const schedule = calculateSubscriptionSchedule(
        input.deliveryDay,
        plan.totalDeliveries,
        now,
      );
      const subscriptionCode = `${SUBSCRIPTION_CODE_PREFIX}-${schedule.yyyymmdd}-${this.generateRandomCodeSuffix()}`;
      const paymentOrderCode = generatePayosOrderCode(now);
      const totalAmountVnd =
        plan.price + plan.totalDeliveries * snapshot.shippingFeePerDelivery;

      const [insertedSub] = await tx
        .insert(subscriptions)
        .values({
          subscriptionCode,
          customerId: sub,
          planId: plan.id,
          userAddressId: snapshot.userAddressId,
          receiverName: snapshot.receiverName,
          receiverPhone: snapshot.receiverPhone,
          shippingAddress: snapshot.formattedAddress,
          shippingDistanceKm: snapshot.roadDistanceKm.toFixed(2),
          shippingFeePerDelivery: snapshot.shippingFeePerDelivery,
          planName: plan.name,
          price: plan.price,
          totalDeliveries: plan.totalDeliveries,
          weightPerDeliveryKg: plan.weightPerDeliveryKg,
          basketDescription: plan.basketDescription,
          deliveryDay: input.deliveryDay,
          remainingDeliveries: plan.totalDeliveries,
          status: SubscriptionStatus.PENDING_PAYMENT,
          reservationExpiresAt,
          startDate: schedule.startDate,
          endDate: schedule.endDate,
        })
        .returning(SUBSCRIPTION_COLUMNS);

      if (!insertedSub) {
        throw new InternalServerErrorException({
          code: API_ERROR_CODES.INTERNAL_SERVER_ERROR,
          detail: MESSAGES.COMMON.INTERNAL_SERVER_ERROR,
        });
      }

      const [insertedPayment] = await tx
        .insert(payments)
        .values({
          orderId: null,
          subscriptionId: insertedSub.id,
          amount: totalAmountVnd,
          paymentMethod: PaymentMethod.PAYOS,
          status: PaymentStatus.PENDING,
          transactionType: PaymentTransactionType.PAYMENT,
          orderCode: paymentOrderCode,
        })
        .returning({ id: payments.id });

      if (!insertedPayment) {
        throw new InternalServerErrorException({
          code: API_ERROR_CODES.INTERNAL_SERVER_ERROR,
          detail: MESSAGES.COMMON.INTERNAL_SERVER_ERROR,
        });
      }

      return {
        projection: this.toProjection(insertedSub, null),
        paymentId: insertedPayment.id,
        paymentOrderCode,
        reservationExpiresAt,
      };
    });
  }

  private async compensateFailedPayosCheckout(
    subscriptionId: string,
    paymentId: string,
  ): Promise<void> {
    const now = new Date();
    await this.db.transaction(async (tx) => {
      const [lockedSub] = await tx
        .select({
          id: subscriptions.id,
          status: subscriptions.status,
        })
        .from(subscriptions)
        .where(eq(subscriptions.id, subscriptionId))
        .for("update");

      if (
        !lockedSub ||
        lockedSub.status !== SubscriptionStatus.PENDING_PAYMENT
      ) {
        return;
      }

      await tx
        .update(subscriptions)
        .set({
          status: SubscriptionStatus.CANCELLED,
          reservationExpiresAt: null,
          updatedAt: now,
        })
        .where(eq(subscriptions.id, subscriptionId));

      await tx
        .update(payments)
        .set({
          status: PaymentStatus.FAILED,
          updatedAt: now,
        })
        .where(eq(payments.id, paymentId));
    });
  }

  private toProjection(
    row: SubscriptionRow,
    paymentUrl: string | null,
  ): SubscriptionProjection {
    return {
      id: row.id,
      subscriptionCode: row.subscriptionCode,
      planId: row.planId,
      planName: row.planName,
      priceVnd: row.price,
      totalDeliveries: row.totalDeliveries,
      weightPerDeliveryKg: Number(row.weightPerDeliveryKg),
      basketDescription: row.basketDescription,
      deliveryDay: row.deliveryDay,
      remainingDeliveries: row.remainingDeliveries,
      status: row.status,
      receiverName: row.receiverName,
      receiverPhone: row.receiverPhone,
      shippingAddress: row.shippingAddress,
      shippingDistanceKm: Number(row.shippingDistanceKm),
      shippingFeePerDeliveryVnd: row.shippingFeePerDelivery,
      totalAmountVnd:
        row.price + row.totalDeliveries * row.shippingFeePerDelivery,
      startDate: row.startDate,
      endDate: row.endDate,
      paymentUrl:
        row.status === SubscriptionStatus.PENDING_PAYMENT ? paymentUrl : null,
      reservationExpiresAt: row.reservationExpiresAt
        ? row.reservationExpiresAt.toISOString()
        : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private generateRandomCodeSuffix(): string {
    const bytes = randomBytes(SUBSCRIPTION_CODE_RANDOM_LENGTH);
    let suffix = "";
    for (const byte of bytes) {
      suffix += CROCKFORD_BASE32_ALPHABET[byte % 32];
    }
    return suffix;
  }
}

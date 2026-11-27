import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { eq } from "drizzle-orm";
import {
  API_ERROR_CODES,
  OrderStatus,
  PaymentStatus,
  SubscriptionStatus,
  type PaymentRawPayload,
} from "@greenroots/shared";
import { MESSAGES } from "@/common/constants/messages.constant";
import {
  DATABASE_CONNECTION,
  type DrizzleDB,
  type DrizzleTx,
} from "@/database/database.module";
import { orders, payments, subscriptions } from "@/database/schemas";
import { PAYMENT_DRIVER_TOKEN } from "./payments.constant";
import type { PaymentDriver, PayosWebhookPayload } from "./payments.interface";

function parsePayosTransactionDate(rawDateTime: string, fallback: Date): Date {
  if (!rawDateTime || rawDateTime.trim().length === 0) {
    return fallback;
  }
  const parsed = new Date(rawDateTime);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

const PAYOS_CONFIRM_WEBHOOK_SAMPLE_ORDER_CODE = 123;

/**
 * Verifies and reconciles incoming PayOS HMAC-SHA256 webhooks against `payments` and `orders` (`ADR-0042`).
 */
@Injectable()
export class PaymentsWebhookService {
  private readonly logger = new Logger(PaymentsWebhookService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DrizzleDB,
    @Inject(PAYMENT_DRIVER_TOKEN)
    private readonly paymentDriver: PaymentDriver,
  ) {}

  /**
   * Verifies webhook signature, locks `orders -> payments` (`FOR UPDATE`), and reconciles payment settlement idempotently.
   *
   * @param payload Raw PayOS webhook envelope.
   * @returns Acknowledgement `{ received: true }`.
   */
  async handlePayosWebhook(
    payload: PayosWebhookPayload,
  ): Promise<{ received: true }> {
    let verified;
    try {
      verified = await this.paymentDriver.verifyWebhook(payload);
    } catch {
      throw new UnauthorizedException({
        code: API_ERROR_CODES.PAYMENT_WEBHOOK_SIGNATURE_INVALID,
        detail: MESSAGES.PAYMENTS.WEBHOOK_SIGNATURE_INVALID,
      });
    }

    const now = new Date();

    return this.db.transaction(async (tx) => {
      const [paymentLookup] = await tx
        .select({
          id: payments.id,
          orderId: payments.orderId,
          subscriptionId: payments.subscriptionId,
        })
        .from(payments)
        .where(eq(payments.orderCode, verified.orderCode))
        .limit(1);

      if (
        !paymentLookup ||
        (!paymentLookup.orderId && !paymentLookup.subscriptionId)
      ) {
        // PayOS `POST /confirm-webhook` sends a signed probe with sample `orderCode = 123` that has no DB row.
        if (
          !paymentLookup &&
          verified.orderCode === PAYOS_CONFIRM_WEBHOOK_SAMPLE_ORDER_CODE
        ) {
          this.logger.log(
            "Acknowledged PayOS confirm-webhook verification probe (orderCode=123).",
          );
          return { received: true };
        }

        throw new NotFoundException({
          code: API_ERROR_CODES.PAYMENT_NOT_FOUND,
          detail: MESSAGES.PAYMENTS.NOT_FOUND,
        });
      }

      if (paymentLookup.subscriptionId && !paymentLookup.orderId) {
        return this.reconcileSubscriptionPayment(
          tx,
          paymentLookup.id,
          paymentLookup.subscriptionId,
          payload,
          verified,
          now,
        );
      }

      const orderId = paymentLookup.orderId!;

      // Lock `orders` before `payments` consistently to prevent deadlocks with cancel/expiry flows (`ADR-0042`).
      const [lockedOrder] = await tx
        .select({
          id: orders.id,
          orderCode: orders.orderCode,
          orderStatus: orders.orderStatus,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .for("update");

      if (!lockedOrder) {
        throw new NotFoundException({
          code: API_ERROR_CODES.PAYMENT_NOT_FOUND,
          detail: MESSAGES.PAYMENTS.NOT_FOUND,
        });
      }

      const settled = await this.lockAndSettlePayment(
        tx,
        paymentLookup.id,
        payload,
        verified,
        now,
      );
      if (!settled.shouldTransitionTarget) {
        return { received: true };
      }

      // Never resurrect a cancelled order; record paid evidence for manual refund reconciliation (`ADR-0042`).
      if (lockedOrder.orderStatus === OrderStatus.CANCELLED) {
        this.logger.error(
          `Late PayOS PAID webhook received for cancelled orderId=${lockedOrder.id} orderCode=${lockedOrder.orderCode} paymentId=${settled.paymentId} amountVnd=${verified.amountVnd}; manual refund reconciliation required.`,
        );
        return { received: true };
      }

      if (lockedOrder.orderStatus !== OrderStatus.PENDING_PAYMENT) {
        this.logger.warn(
          `PayOS PAID webhook received for orderId=${lockedOrder.id} orderCode=${lockedOrder.orderCode} in unexpected status=${lockedOrder.orderStatus}; skipping order status transition.`,
        );
        return { received: true };
      }

      await tx
        .update(orders)
        .set({
          paymentStatus: PaymentStatus.PAID,
          orderStatus: OrderStatus.CONFIRMED,
          reservationExpiresAt: null,
          updatedAt: now,
        })
        .where(eq(orders.id, lockedOrder.id));

      return { received: true };
    });
  }

  private async reconcileSubscriptionPayment(
    tx: DrizzleTx,
    paymentId: string,
    subscriptionId: string,
    payload: PayosWebhookPayload,
    verified: Awaited<ReturnType<PaymentDriver["verifyWebhook"]>>,
    now: Date,
  ): Promise<{ received: true }> {
    // Lock `subscriptions` before `payments` consistently to prevent deadlocks with cancel/expiry flows (`ADR-0041`).
    const [lockedSubscription] = await tx
      .select({
        id: subscriptions.id,
        subscriptionCode: subscriptions.subscriptionCode,
        status: subscriptions.status,
      })
      .from(subscriptions)
      .where(eq(subscriptions.id, subscriptionId))
      .for("update");

    if (!lockedSubscription) {
      throw new NotFoundException({
        code: API_ERROR_CODES.PAYMENT_NOT_FOUND,
        detail: MESSAGES.PAYMENTS.NOT_FOUND,
      });
    }

    const settled = await this.lockAndSettlePayment(
      tx,
      paymentId,
      payload,
      verified,
      now,
    );
    if (!settled.shouldTransitionTarget) {
      return { received: true };
    }

    // Never resurrect a cancelled subscription; record paid evidence for manual refund reconciliation (`ADR-0041`).
    if (lockedSubscription.status === SubscriptionStatus.CANCELLED) {
      this.logger.error(
        `Late PayOS PAID webhook received for cancelled subscriptionId=${lockedSubscription.id} subscriptionCode=${lockedSubscription.subscriptionCode} paymentId=${settled.paymentId} amountVnd=${verified.amountVnd}; manual refund reconciliation required.`,
      );
      return { received: true };
    }

    if (lockedSubscription.status !== SubscriptionStatus.PENDING_PAYMENT) {
      this.logger.warn(
        `PayOS PAID webhook received for subscriptionId=${lockedSubscription.id} subscriptionCode=${lockedSubscription.subscriptionCode} in unexpected status=${lockedSubscription.status}; skipping status transition.`,
      );
      return { received: true };
    }

    await tx
      .update(subscriptions)
      .set({
        status: SubscriptionStatus.ACTIVE,
        reservationExpiresAt: null,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, lockedSubscription.id));

    return { received: true };
  }

  private async lockAndSettlePayment(
    tx: DrizzleTx,
    paymentId: string,
    payload: PayosWebhookPayload,
    verified: Awaited<ReturnType<PaymentDriver["verifyWebhook"]>>,
    now: Date,
  ): Promise<{ paymentId: string; shouldTransitionTarget: boolean }> {
    const [lockedPayment] = await tx
      .select({
        id: payments.id,
        amount: payments.amount,
        status: payments.status,
        referenceCode: payments.referenceCode,
      })
      .from(payments)
      .where(eq(payments.id, paymentId))
      .for("update");

    if (!lockedPayment) {
      throw new NotFoundException({
        code: API_ERROR_CODES.PAYMENT_NOT_FOUND,
        detail: MESSAGES.PAYMENTS.NOT_FOUND,
      });
    }

    if (
      lockedPayment.status === PaymentStatus.PAID ||
      (verified.reference.length > 0 &&
        lockedPayment.referenceCode === verified.reference)
    ) {
      return { paymentId: lockedPayment.id, shouldTransitionTarget: false };
    }

    if (payload.code !== "00" || verified.code !== "00") {
      return { paymentId: lockedPayment.id, shouldTransitionTarget: false };
    }

    if (verified.amountVnd !== lockedPayment.amount) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.PAYMENT_AMOUNT_MISMATCH,
        detail: MESSAGES.PAYMENTS.AMOUNT_MISMATCH,
      });
    }

    const paidAt = parsePayosTransactionDate(verified.transactionDateTime, now);
    const rawPayload = payload as unknown as PaymentRawPayload;

    await tx
      .update(payments)
      .set({
        status: PaymentStatus.PAID,
        referenceCode: verified.reference || null,
        rawPayload,
        paidAt,
        updatedAt: now,
      })
      .where(eq(payments.id, lockedPayment.id));

    return { paymentId: lockedPayment.id, shouldTransitionTarget: true };
  }
}

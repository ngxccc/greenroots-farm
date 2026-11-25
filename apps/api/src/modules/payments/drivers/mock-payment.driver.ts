import { Injectable, Logger } from "@nestjs/common";
import type {
  CancelPaymentLinkResult,
  CreatePaymentLinkInput,
  CreatePaymentLinkResult,
  PaymentDriver,
  PayosWebhookPayload,
  VerifiedPaymentWebhookData,
} from "../payments.interface";
import {
  assertValidCreatePaymentLinkInput,
  assertValidOrderCode,
  extractVerifiedWebhookData,
} from "./payment-validation.util";

/**
 * Recorded payment link state stored in memory by `MockPaymentDriver`.
 */
export interface MockPaymentLinkRecord {
  readonly orderCode: number;
  readonly amountVnd: number;
  readonly description: string;
  readonly paymentLinkId: string;
  readonly checkoutUrl: string;
  readonly qrCode: string;
  status: string;
  canceledAt: string | null;
  cancellationReason: string | null;
}

/**
 * Deterministic in-memory `PaymentDriver` used in tests and offline development.
 */
@Injectable()
export class MockPaymentDriver implements PaymentDriver {
  private readonly logger = new Logger(MockPaymentDriver.name);
  private readonly links = new Map<number, MockPaymentLinkRecord>();

  /**
   * Creates a deterministic mock payment link and records it in memory.
   *
   * @param input Payment link creation input.
   * @returns Deterministic checkout URL, payment link ID, QR payload, and status.
   */
  createPaymentLink(
    input: CreatePaymentLinkInput,
  ): Promise<CreatePaymentLinkResult> {
    return Promise.resolve().then(() => {
      assertValidCreatePaymentLinkInput(input);

      const paymentLinkId = `mock-link-${input.orderCode}`;
      const checkoutUrl = `https://mock.payos.local/checkout/${input.orderCode}`;
      const qrCode = `MOCK_VIETQR_${input.orderCode}_${input.amountVnd}`;

      const record: MockPaymentLinkRecord = {
        orderCode: input.orderCode,
        amountVnd: input.amountVnd,
        description: input.description,
        paymentLinkId,
        checkoutUrl,
        qrCode,
        status: "PENDING",
        canceledAt: null,
        cancellationReason: null,
      };

      this.links.set(input.orderCode, record);
      this.logger.log(
        `Created payment link for orderCode=${input.orderCode} (${input.amountVnd} VND)`,
      );

      return {
        checkoutUrl,
        paymentLinkId,
        orderCode: input.orderCode,
        qrCode,
        status: record.status,
      };
    });
  }

  /**
   * Verifies a mock webhook payload, failing closed when the signature is missing or `"invalid"`.
   *
   * @param payload Raw webhook payload.
   * @returns Extracted verified payment webhook data.
   */
  verifyWebhook(
    payload: PayosWebhookPayload,
  ): Promise<VerifiedPaymentWebhookData> {
    return Promise.resolve().then(() => {
      const rawData: unknown = payload.data;
      if (
        typeof rawData !== "object" ||
        rawData === null ||
        Array.isArray(rawData)
      ) {
        throw new Error("Invalid mock webhook payload: missing data object");
      }
      if (
        typeof payload.signature !== "string" ||
        payload.signature.trim().length === 0 ||
        payload.signature === "invalid"
      ) {
        throw new Error("Invalid mock webhook signature");
      }

      const orderCode = Number(payload.data["orderCode"]);
      return extractVerifiedWebhookData(payload, {
        reference: `MOCK_REF_${orderCode}`,
        transactionDateTime: new Date().toISOString(),
        paymentLinkId: `mock-link-${orderCode}`,
      });
    });
  }

  /**
   * Cancels a mock payment link by PayOS order code.
   *
   * @param orderCode Numeric PayOS order code.
   * @param reason Optional cancellation reason.
   * @returns Cancellation metadata.
   */
  cancelPaymentLink(
    orderCode: number,
    reason?: string,
  ): Promise<CancelPaymentLinkResult> {
    return Promise.resolve().then(() => {
      assertValidOrderCode(orderCode);

      const canceledAt = new Date().toISOString();
      const cancellationReason = reason ?? null;
      const existing = this.links.get(orderCode);

      if (existing) {
        existing.status = "CANCELLED";
        existing.canceledAt = canceledAt;
        existing.cancellationReason = cancellationReason;
      }

      return {
        paymentLinkId: existing?.paymentLinkId ?? `mock-link-${orderCode}`,
        orderCode,
        status: "CANCELLED",
        canceledAt,
        cancellationReason,
      };
    });
  }

  /**
   * Returns all recorded mock payment links for test inspection.
   */
  getCreatedLinks(): readonly MockPaymentLinkRecord[] {
    return Array.from(this.links.values());
  }

  /**
   * Clears all recorded mock payment links between tests.
   */
  clear(): void {
    this.links.clear();
  }
}

import { Injectable, Logger } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/common/config/env.config";
import {
  PAYOS_API_BASE_URL,
  PAYOS_REQUEST_TIMEOUT_MS,
} from "../payments.constant";
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
 * PayOS merchant credentials required for authenticated API requests and HMAC verification.
 */
export interface PayosCredentials {
  readonly clientId: string;
  readonly apiKey: string;
  readonly checksumKey: string;
}

type PayosFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

interface PayosApiEnvelope<T> {
  readonly code?: string;
  readonly desc?: string;
  readonly data?: T;
}

interface PayosCreateLinkData {
  readonly checkoutUrl: string;
  readonly paymentLinkId: string;
  readonly orderCode: number;
  readonly qrCode: string;
  readonly status: string;
}

interface PayosCancelLinkData {
  readonly id?: string;
  readonly paymentLinkId?: string;
  readonly orderCode: number;
  readonly status: string;
  readonly canceledAt?: string | null;
  readonly cancellationReason?: string | null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sortValueRecursively(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValueRecursively);
  }
  if (isPlainObject(value)) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortValueRecursively(value[key]);
    }
    return sorted;
  }
  return value;
}

function formatScalar(value: unknown): string {
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  return JSON.stringify(value);
}

/**
 * Canonicalizes a PayOS webhook `data` object into a sorted query string
 * (`key=value&...`) matching PayOS v2 HMAC-SHA256 signing rules.
 */
function canonicalizeWebhookData(data: Record<string, unknown>): string {
  return Object.keys(data)
    .sort()
    .filter((key) => data[key] !== undefined)
    .map((key) => {
      const value = data[key];
      if (value === null || value === "null" || value === "undefined") {
        return `${key}=`;
      }
      if (Array.isArray(value) || isPlainObject(value)) {
        return `${key}=${JSON.stringify(sortValueRecursively(value))}`;
      }
      return `${key}=${formatScalar(value)}`;
    })
    .join("&");
}

/**
 * PayOS v2 Merchant API adapter built on native `fetch`, `node:crypto`, and `AbortSignal.timeout`.
 */
@Injectable()
export class PayOSAdapter implements PaymentDriver {
  private readonly logger = new Logger(PayOSAdapter.name);
  private credentialsOverride?: PayosCredentials;
  private fetchImpl: PayosFetch = fetch;

  /**
   * Creates an isolated `PayOSAdapter` instance with explicit credentials and `fetch` implementation for testing.
   *
   * @param credentials PayOS merchant credentials.
   * @param fetchImpl Optional `fetch` implementation override.
   * @returns Configured `PayOSAdapter` instance.
   */
  static withCredentials(
    credentials: PayosCredentials,
    fetchImpl: PayosFetch = fetch,
  ): PayOSAdapter {
    const adapter = new PayOSAdapter();
    adapter.credentialsOverride = credentials;
    adapter.fetchImpl = fetchImpl;
    return adapter;
  }

  /**
   * Creates a PayOS VietQR payment link via `POST /v2/payment-requests`.
   *
   * @param input Payment link creation input.
   * @returns Checkout URL, payment link ID, order code, QR code, and status.
   */
  async createPaymentLink(
    input: CreatePaymentLinkInput,
  ): Promise<CreatePaymentLinkResult> {
    assertValidCreatePaymentLinkInput(input);

    const { checksumKey } = this.getCredentials();
    const canonicalRequest =
      `amount=${input.amountVnd}` +
      `&cancelUrl=${input.cancelUrl}` +
      `&description=${input.description}` +
      `&orderCode=${input.orderCode}` +
      `&returnUrl=${input.returnUrl}`;

    const signature = createHmac("sha256", checksumKey)
      .update(canonicalRequest)
      .digest("hex");

    const body: Record<string, unknown> = {
      orderCode: input.orderCode,
      amount: input.amountVnd,
      description: input.description,
      returnUrl: input.returnUrl,
      cancelUrl: input.cancelUrl,
      signature,
    };

    if (input.expiredAt !== undefined) body["expiredAt"] = input.expiredAt;
    if (input.items !== undefined) {
      body["items"] = input.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        price: item.priceVnd,
      }));
    }
    if (input.buyerName !== undefined) body["buyerName"] = input.buyerName;
    if (input.buyerEmail !== undefined) body["buyerEmail"] = input.buyerEmail;
    if (input.buyerPhone !== undefined) body["buyerPhone"] = input.buyerPhone;
    if (input.buyerAddress !== undefined) {
      body["buyerAddress"] = input.buyerAddress;
    }

    const data = await this.postPayos<PayosCreateLinkData>(
      "/v2/payment-requests",
      body,
    );

    return {
      checkoutUrl: data.checkoutUrl,
      paymentLinkId: data.paymentLinkId,
      orderCode: data.orderCode,
      qrCode: data.qrCode,
      status: data.status,
    };
  }

  /**
   * Verifies a PayOS webhook payload's HMAC-SHA256 signature in constant time.
   *
   * @param payload Raw webhook payload.
   * @returns Verified payment transaction data.
   */
  verifyWebhook(
    payload: PayosWebhookPayload,
  ): Promise<VerifiedPaymentWebhookData> {
    return Promise.resolve().then(() => {
      if (!isPlainObject(payload.data)) {
        throw new Error("Invalid PayOS webhook payload: missing data object");
      }
      if (
        typeof payload.signature !== "string" ||
        payload.signature.length === 0 ||
        payload.signature.length % 2 !== 0 ||
        !/^[0-9a-fA-F]+$/.test(payload.signature)
      ) {
        throw new Error("Invalid PayOS webhook signature");
      }

      const { checksumKey } = this.getCredentials();
      const canonical = canonicalizeWebhookData(payload.data);
      const expectedHex = createHmac("sha256", checksumKey)
        .update(canonical)
        .digest("hex");

      const expectedBuf = Buffer.from(expectedHex, "hex");
      const actualBuf = Buffer.from(payload.signature, "hex");

      if (
        expectedBuf.length !== actualBuf.length ||
        !timingSafeEqual(expectedBuf, actualBuf)
      ) {
        throw new Error("Invalid PayOS webhook signature");
      }

      return extractVerifiedWebhookData(payload);
    });
  }

  /**
   * Cancels an active PayOS payment link via `POST /v2/payment-requests/{orderCode}/cancel`.
   *
   * @param orderCode Numeric PayOS order code.
   * @param reason Optional cancellation reason.
   * @returns Cancellation status metadata.
   */
  async cancelPaymentLink(
    orderCode: number,
    reason?: string,
  ): Promise<CancelPaymentLinkResult> {
    assertValidOrderCode(orderCode);

    const body = reason ? { cancellationReason: reason } : undefined;
    const data = await this.postPayos<PayosCancelLinkData>(
      `/v2/payment-requests/${orderCode}/cancel`,
      body,
    );

    return {
      paymentLinkId: data.paymentLinkId ?? data.id ?? "",
      orderCode: data.orderCode,
      status: data.status,
      canceledAt: data.canceledAt ?? null,
      cancellationReason: data.cancellationReason ?? null,
    };
  }

  private getCredentials(): PayosCredentials {
    const clientId = (
      this.credentialsOverride?.clientId ?? env.PAYOS_CLIENT_ID
    )?.trim();
    const apiKey = (
      this.credentialsOverride?.apiKey ?? env.PAYOS_API_KEY
    )?.trim();
    const checksumKey = (
      this.credentialsOverride?.checksumKey ?? env.PAYOS_CHECKSUM_KEY
    )?.trim();

    if (!clientId || !apiKey || !checksumKey) {
      throw new Error(
        "PAYOS_CLIENT_ID, PAYOS_API_KEY, and PAYOS_CHECKSUM_KEY must be configured",
      );
    }

    return { clientId, apiKey, checksumKey };
  }

  private async postPayos<T>(
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const { clientId, apiKey } = this.getCredentials();

    let response: Response;
    try {
      response = await this.fetchImpl(`${PAYOS_API_BASE_URL}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-client-id": clientId,
          "x-api-key": apiKey,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(PAYOS_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const isTimeout =
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError");
      this.logger.error(
        `PayOS request ${isTimeout ? "timed out" : "failed"} for ${path}`,
      );
      throw new Error(
        isTimeout
          ? "PayOS gateway request timed out"
          : "PayOS gateway request failed",
        { cause: error },
      );
    }

    if (!response.ok) {
      this.logger.error(
        `PayOS API returned HTTP ${response.status} for ${path}`,
      );
      throw new Error(
        `PayOS API request failed with status ${response.status}`,
      );
    }

    let envelope: PayosApiEnvelope<T>;
    try {
      envelope = (await response.json()) as PayosApiEnvelope<T>;
    } catch (error) {
      this.logger.error(
        `PayOS API returned invalid JSON for ${path} (status=${response.status})`,
      );
      throw new Error("PayOS API returned an invalid JSON response", {
        cause: error,
      });
    }
    if (envelope.code !== "00" || !envelope.data) {
      const code = envelope.code ?? "UNKNOWN";
      this.logger.error(`PayOS gateway rejected ${path} with code=${code}`);
      throw new Error(`PayOS gateway rejected request (code: ${code})`);
    }

    return envelope.data;
  }
}

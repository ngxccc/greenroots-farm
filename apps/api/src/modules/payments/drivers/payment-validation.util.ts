import { PAYOS_DESCRIPTION_MAX_LENGTH } from "../payments.constant";
import type {
  CreatePaymentLinkInput,
  PayosWebhookPayload,
  VerifiedPaymentWebhookData,
} from "../payments.interface";

/**
 * Validates that a PayOS order code is a positive safe integer.
 *
 * @param orderCode Numeric PayOS order code.
 */
export function assertValidOrderCode(orderCode: number): void {
  if (!Number.isSafeInteger(orderCode) || orderCode < 1) {
    throw new Error(
      "PayOS orderCode must be a positive safe integer (1 <= orderCode <= Number.MAX_SAFE_INTEGER)",
    );
  }
}

/**
 * Validates common invariants on `CreatePaymentLinkInput` across all payment drivers.
 *
 * @param input Payment link creation payload.
 */
export function assertValidCreatePaymentLinkInput(
  input: CreatePaymentLinkInput,
): void {
  assertValidOrderCode(input.orderCode);

  if (!Number.isSafeInteger(input.amountVnd) || input.amountVnd < 1) {
    throw new Error("Payment amountVnd must be a positive integer");
  }

  if (
    typeof input.description !== "string" ||
    input.description.trim().length === 0 ||
    input.description.length > PAYOS_DESCRIPTION_MAX_LENGTH
  ) {
    throw new Error(
      `Payment description must be 1-${PAYOS_DESCRIPTION_MAX_LENGTH} characters`,
    );
  }

  if (
    typeof input.returnUrl !== "string" ||
    input.returnUrl.trim().length === 0
  ) {
    throw new Error("Payment returnUrl is required");
  }

  if (
    typeof input.cancelUrl !== "string" ||
    input.cancelUrl.trim().length === 0
  ) {
    throw new Error("Payment cancelUrl is required");
  }
}

function readStringField(
  data: Record<string, unknown>,
  key: string,
  fallback = "",
): string {
  const value = data[key];
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
}

function readOptionalStringField(
  data: Record<string, unknown>,
  key: string,
): string | null {
  const value = data[key];
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

/**
 * Validates and extracts normalized `VerifiedPaymentWebhookData` from a webhook payload.
 *
 * @param payload Raw webhook payload.
 * @param defaults Optional fallback values for mock driver fields.
 * @returns Normalized verified webhook transaction data.
 */
export function extractVerifiedWebhookData(
  payload: PayosWebhookPayload,
  defaults?: {
    reference?: string;
    transactionDateTime?: string;
    paymentLinkId?: string;
  },
): VerifiedPaymentWebhookData {
  const data = payload.data;
  const orderCode = Number(data["orderCode"]);
  const amountVnd = Number(data["amount"]);
  assertValidOrderCode(orderCode);

  if (!Number.isSafeInteger(amountVnd) || amountVnd < 1) {
    throw new Error("Webhook amount must be a positive integer");
  }

  return {
    orderCode,
    amountVnd,
    description: readStringField(data, "description"),
    accountNumber: readStringField(data, "accountNumber"),
    reference: readStringField(data, "reference", defaults?.reference ?? ""),
    transactionDateTime: readStringField(
      data,
      "transactionDateTime",
      defaults?.transactionDateTime ?? "",
    ),
    currency: readStringField(data, "currency", "VND"),
    paymentLinkId: readStringField(
      data,
      "paymentLinkId",
      defaults?.paymentLinkId ?? "",
    ),
    code: readStringField(data, "code", payload.code),
    desc: readStringField(data, "desc", payload.desc),
    counterAccountBankId: readOptionalStringField(data, "counterAccountBankId"),
    counterAccountBankName: readOptionalStringField(
      data,
      "counterAccountBankName",
    ),
    counterAccountName: readOptionalStringField(data, "counterAccountName"),
    counterAccountNumber: readOptionalStringField(data, "counterAccountNumber"),
    virtualAccountName: readOptionalStringField(data, "virtualAccountName"),
    virtualAccountNumber: readOptionalStringField(data, "virtualAccountNumber"),
  };
}

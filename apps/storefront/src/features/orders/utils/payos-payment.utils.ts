import { OrderStatus, PaymentMethod, PaymentStatus } from "@greenroots/shared";
import type { OrderDto } from "../schemas/order.schema";

/**
 * UI phase for an order's PayOS VietQR payment panel on `/orders/[id]`.
 */
export type PayosPanelPhase = "pending" | "success" | "expired" | "none";

const MOCK_PAYOS_HOST = "mock.payos.local";
const MOCK_PAYOS_PATH_REGEX = /^\/checkout\/(\d+)$/;

/**
 * Extracts the numeric PayOS `orderCode` from a `MockPaymentDriver` checkout URL
 * (`https://mock.payos.local/checkout/<orderCode>`). Returns `null` for real PayOS
 * URLs, missing URLs, or malformed values.
 *
 * @param paymentUrl Nullable `OrderDto.paymentUrl` returned by the API.
 * @returns Positive safe integer `orderCode` when URL is a valid mock PayOS link, else `null`.
 */
export function parseMockPayosOrderCode(
  paymentUrl: string | null | undefined,
): number | null {
  if (!paymentUrl) {
    return null;
  }

  try {
    const parsed = new URL(paymentUrl);
    if (parsed.protocol !== "https:" || parsed.hostname !== MOCK_PAYOS_HOST) {
      return null;
    }
    const match = MOCK_PAYOS_PATH_REGEX.exec(parsed.pathname);
    if (!match) {
      return null;
    }
    const numeric = Number(match[1]);
    if (!Number.isSafeInteger(numeric) || numeric <= 0) {
      return null;
    }
    return numeric;
  } catch {
    return null;
  }
}

/**
 * Computes remaining seconds until `reservationExpiresAt`, clamped to zero.
 *
 * @param reservationExpiresAt ISO-8601 expiry timestamp from `OrderDto`.
 * @param nowMs Current epoch milliseconds (defaults to `Date.now()`).
 * @returns Non-negative integer seconds remaining.
 */
export function computeRemainingSeconds(
  reservationExpiresAt: string | null | undefined,
  nowMs: number = Date.now(),
): number {
  if (!reservationExpiresAt) {
    return 0;
  }

  const expiresMs = Date.parse(reservationExpiresAt);
  if (!Number.isFinite(expiresMs)) {
    return 0;
  }

  return Math.max(0, Math.floor((expiresMs - nowMs) / 1000));
}

/**
 * Formats non-negative seconds as `MM:SS` with zero padding (e.g., `14:59`, `00:00`).
 *
 * @param remainingSeconds Non-negative integer seconds.
 * @returns Formatted `MM:SS` countdown string.
 */
export function formatCountdownMmSs(remainingSeconds: number): string {
  const safeSeconds = Number.isFinite(remainingSeconds)
    ? Math.max(0, Math.floor(remainingSeconds))
    : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Maps an `OrderDto` status snapshot to the PayOS payment panel phase.
 *
 * @param order Order status projection fields.
 * @returns `"pending"`, `"success"`, `"expired"`, or `"none"` for non-PayOS orders.
 */
export function resolvePayosPanelPhase(
  order: Pick<OrderDto, "orderStatus" | "paymentMethod" | "paymentStatus">,
): PayosPanelPhase {
  if (order.paymentMethod !== PaymentMethod.PAYOS) {
    return "none";
  }
  if (order.orderStatus === OrderStatus.PENDING_PAYMENT) {
    return "pending";
  }
  if (order.orderStatus === OrderStatus.CANCELLED) {
    return "expired";
  }
  if (
    order.paymentStatus === PaymentStatus.PAID ||
    order.orderStatus === OrderStatus.CONFIRMED ||
    order.orderStatus === OrderStatus.PACKING ||
    order.orderStatus === OrderStatus.SHIPPING ||
    order.orderStatus === OrderStatus.DELIVERED ||
    order.orderStatus === OrderStatus.COMPLETED
  ) {
    return "success";
  }
  return "none";
}

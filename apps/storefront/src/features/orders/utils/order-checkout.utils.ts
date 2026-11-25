import { BUSINESS_RULES } from "@greenroots/shared";
import { roundQuantity } from "@/lib/format";
import type { CartItem } from "@/stores/cart.store";
import type {
  ValidateCartItem,
  ValidateCartResponse,
} from "../schemas/order.schema";

/**
 * Progress breakdown toward `BUSINESS_RULES.MIN_ORDER_VALUE_VND`.
 */
export interface MovProgress {
  readonly minOrderValueVnd: number;
  readonly currentSubtotalVnd: number;
  readonly remainingVnd: number;
  readonly progressPercent: number;
  readonly meetsMinOrderValue: boolean;
}

/**
 * Reconciliation summary comparing local `useCartStore` items against `ValidateCartResponseDto`.
 */
export interface CartReconciliationResult {
  readonly priceChangedProductIds: readonly string[];
  readonly issueItems: readonly ValidateCartItem[];
  readonly hasBlockingItemIssues: boolean;
}

/**
 * Computes deterministic payload signature for `POST /api/v1/orders/checkout`
 * so identical retries reuse the same `Idempotency-Key` while any cart, address,
 * or loyalty change generates a fresh key.
 *
 * @param params Checkout payload fields affecting server-side idempotency hash.
 * @returns Stable serialized signature string.
 */
export function buildCheckoutPayloadSignature(params: {
  readonly items: readonly {
    readonly productId: string;
    readonly quantity: number;
  }[];
  readonly addressId?: string | null;
  readonly loyaltyPoints: number;
}): string {
  const merged = new Map<string, number>();
  for (const item of params.items) {
    const prev = merged.get(item.productId) ?? 0;
    merged.set(item.productId, roundQuantity(prev + item.quantity));
  }

  const normalizedItems = Array.from(merged.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([productId, quantity]) => `${productId}:${quantity.toFixed(2)}`);

  return JSON.stringify({
    items: normalizedItems,
    addressId: params.addressId ?? null,
    loyaltyPoints: Math.max(0, Math.floor(params.loyaltyPoints)),
  });
}

/**
 * Clamps requested loyalty points against customer balance and merchandise subtotal
 * (`1 point = 1 VND`; shipping fees are excluded per `INV-ORD-4`).
 *
 * @param requested User-entered loyalty points.
 * @param available Customer's available `rewardPoints` balance.
 * @param subtotalVnd Merchandise subtotal in integer VND.
 * @returns Non-negative integer loyalty points eligible for redemption.
 */
export function clampLoyaltyPoints(
  requested: number,
  available: number,
  subtotalVnd: number,
): number {
  if (!Number.isFinite(requested) || requested <= 0) {
    return 0;
  }
  const maxApplicable = Math.max(
    0,
    Math.min(Math.floor(available), Math.floor(subtotalVnd)),
  );
  return Math.min(Math.floor(requested), maxApplicable);
}

/**
 * Calculates progress toward `BUSINESS_RULES.MIN_ORDER_VALUE_VND`.
 *
 * @param subtotalVnd Merchandise subtotal in integer VND.
 * @returns MOV threshold, remaining amount, percentage (0..100), and boolean flag.
 */
export function calculateMovProgress(subtotalVnd: number): MovProgress {
  const minOrderValueVnd = BUSINESS_RULES.MIN_ORDER_VALUE_VND;
  const safeSubtotal = Math.max(0, Math.round(subtotalVnd));
  const remainingVnd = Math.max(0, minOrderValueVnd - safeSubtotal);
  const progressPercent = Math.min(
    100,
    Math.round((safeSubtotal / minOrderValueVnd) * 100),
  );

  return {
    minOrderValueVnd,
    currentSubtotalVnd: safeSubtotal,
    remainingVnd,
    progressPercent,
    meetsMinOrderValue: safeSubtotal >= minOrderValueVnd,
  };
}

/**
 * Reconciles `useCartStore` items against `ValidateCartResponseDto`, identifying
 * server-side price updates and blocking stock/availability issues without silently
 * deleting or clamping user quantities.
 *
 * @param localItems Current client cart items.
 * @param response Server validation response.
 * @returns Lists of price-drifted IDs and items with `PRODUCT_UNAVAILABLE` or `INSUFFICIENT_STOCK`.
 */
export function reconcileValidatedCart(
  localItems: readonly CartItem[],
  response: ValidateCartResponse,
): CartReconciliationResult {
  const localById = new Map(localItems.map((item) => [item.productId, item]));
  const priceChangedProductIds: string[] = [];
  const issueItems: ValidateCartItem[] = [];

  for (const serverItem of response.items) {
    if (serverItem.issue !== null || !serverItem.isAvailable) {
      issueItems.push(serverItem);
    }

    const local = localById.get(serverItem.productId);
    if (
      local &&
      serverItem.issue !== "PRODUCT_UNAVAILABLE" &&
      serverItem.unitPriceVnd !== local.unitPriceVnd
    ) {
      priceChangedProductIds.push(serverItem.productId);
    }
  }

  return {
    priceChangedProductIds,
    issueItems,
    hasBlockingItemIssues: issueItems.length > 0,
  };
}

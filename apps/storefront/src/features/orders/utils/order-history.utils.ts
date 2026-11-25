import { OrderStatus, PaymentMethod } from "@greenroots/shared";
import type { StorefrontProduct } from "@/features/catalog/types/catalog.types";
import type { OrderDto } from "../schemas/order.schema";

/**
 * Tab key identifiers for `/account/orders` 5-tab customer order history filtering.
 */
export type OrderHistoryTabKey =
  | "all"
  | "pending"
  | "shipping"
  | "completed"
  | "cancelled";

/**
 * Definition for a single customer order history status tab.
 */
export interface OrderHistoryTabConfig {
  readonly key: OrderHistoryTabKey;
  readonly label: string;
  readonly statuses?: readonly OrderStatus[];
}

/**
 * Default page size for `/account/orders` pagination.
 */
export const ORDER_HISTORY_PAGE_SIZE = 10;

/**
 * Five customer-facing order filter tabs grouping all eight `OrderStatus` states.
 */
export const ORDER_HISTORY_TABS: readonly OrderHistoryTabConfig[] = [
  {
    key: "all",
    label: "Tất cả",
  },
  {
    key: "pending",
    label: "Chờ xử lý",
    statuses: [
      OrderStatus.PENDING_PAYMENT,
      OrderStatus.PENDING_CONFIRMATION,
      OrderStatus.CONFIRMED,
      OrderStatus.PACKING,
    ],
  },
  {
    key: "shipping",
    label: "Đang giao",
    statuses: [OrderStatus.SHIPPING],
  },
  {
    key: "completed",
    label: "Hoàn tất",
    statuses: [OrderStatus.DELIVERED, OrderStatus.COMPLETED],
  },
  {
    key: "cancelled",
    label: "Đã hủy",
    statuses: [OrderStatus.CANCELLED],
  },
];

/**
 * Normalized search parameters for `/account/orders`.
 */
export interface ParsedOrderHistorySearchParams {
  readonly tab: OrderHistoryTabKey;
  readonly page: number;
}

/**
 * Timeline step state rendered on SF-05 `/orders/[id]`.
 */
export type OrderTimelineStepState =
  | "completed"
  | "current"
  | "upcoming"
  | "cancelled";

/**
 * Single timeline step derived honestly from `OrderDto` without fabricated timestamps.
 */
export interface OrderTimelineStep {
  readonly key:
    | "placed"
    | "processing"
    | "shipping"
    | "delivered"
    | "cancelled";
  readonly label: string;
  readonly state: OrderTimelineStepState;
  readonly timestamp?: string;
}

const VALID_TAB_KEYS = new Set<OrderHistoryTabKey>(
  ORDER_HISTORY_TABS.map((tab) => tab.key),
);

function pickFirstParam(
  value: string | readonly string[] | undefined,
): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    const first: unknown = value[0];
    return typeof first === "string" ? first : undefined;
  }
  return undefined;
}

/**
 * Parses and clamps `/account/orders` URL search parameters (`tab`, `page`).
 *
 * @param searchParams Raw Next.js `searchParams` record.
 * @returns Validated tab key and 1-based page number.
 */
export function parseOrderHistorySearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): ParsedOrderHistorySearchParams {
  const rawTab = pickFirstParam(searchParams.tab);
  const tab: OrderHistoryTabKey =
    rawTab && VALID_TAB_KEYS.has(rawTab as OrderHistoryTabKey)
      ? (rawTab as OrderHistoryTabKey)
      : "all";

  const rawPage = pickFirstParam(searchParams.page);
  const parsedPage = rawPage ? Number.parseInt(rawPage, 10) : 1;
  const page = Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;

  return { tab, page };
}

export function buildOrderHistoryHref(
  tab: OrderHistoryTabKey,
  page: number,
): string {
  const query = new URLSearchParams();
  if (tab !== "all") {
    query.set("tab", tab);
  }
  if (page > 1) {
    query.set("page", String(page));
  }
  const qs = query.toString();
  return qs ? `/account/orders?${qs}` : "/account/orders";
}

/**
 * Resolves the comma-separated `statuses` query string for `GET /api/v1/orders/me`.
 *
 * @param tab Active order history tab key.
 * @returns Comma-separated `OrderStatus` string, or `undefined` for `all`.
 */
export function resolveStatusesQueryForTab(
  tab: OrderHistoryTabKey,
): string | undefined {
  const config = ORDER_HISTORY_TABS.find((entry) => entry.key === tab);
  if (!config?.statuses || config.statuses.length === 0) {
    return undefined;
  }
  return config.statuses.join(",");
}

/**
 * Derives a 4-stage (or cancelled) customer timeline from `OrderDto` without fabricating
 * intermediate per-step timestamps absent from the backend contract (`ADR-0032`).
 *
 * @param orderStatus Current `OrderStatus` from `OrderDto`.
 * @param createdAt Order creation ISO timestamp.
 * @param updatedAt Order last-update ISO timestamp.
 * @returns Ordered timeline steps with accurate states and available timestamps.
 */
export function buildOrderTimelineSteps(
  orderStatus: OrderDto["orderStatus"],
  createdAt: string,
  updatedAt: string,
): readonly OrderTimelineStep[] {
  if (orderStatus === OrderStatus.CANCELLED) {
    return [
      {
        key: "placed",
        label: "1. Đã đặt đơn",
        state: "completed",
        timestamp: createdAt,
      },
      {
        key: "cancelled",
        label: "Đơn hàng đã hủy",
        state: "cancelled",
        timestamp: updatedAt,
      },
    ];
  }

  const stageIndex = resolveTimelineStageIndex(orderStatus);

  return [
    {
      key: "placed",
      label: "1. Đã đặt đơn",
      state: stageIndex === 0 ? "current" : "completed",
      timestamp: createdAt,
    },
    {
      key: "processing",
      label: "2. Xác nhận & Đóng gói",
      state:
        stageIndex > 1
          ? "completed"
          : stageIndex === 1
            ? "current"
            : "upcoming",
      timestamp: stageIndex === 1 ? updatedAt : undefined,
    },
    {
      key: "shipping",
      label: "3. Giao xe lạnh",
      state:
        stageIndex > 2
          ? "completed"
          : stageIndex === 2
            ? "current"
            : "upcoming",
      timestamp: stageIndex === 2 ? updatedAt : undefined,
    },
    {
      key: "delivered",
      label: "4. Đã giao hàng",
      state: stageIndex >= 3 ? "completed" : "upcoming",
      timestamp: stageIndex >= 3 ? updatedAt : undefined,
    },
  ];
}

function resolveTimelineStageIndex(
  orderStatus: Exclude<OrderDto["orderStatus"], "cancelled">,
): 0 | 1 | 2 | 3 {
  switch (orderStatus) {
    case OrderStatus.PENDING_PAYMENT:
    case OrderStatus.PENDING_CONFIRMATION:
      return 0;
    case OrderStatus.CONFIRMED:
    case OrderStatus.PACKING:
      return 1;
    case OrderStatus.SHIPPING:
      return 2;
    case OrderStatus.DELIVERED:
    case OrderStatus.COMPLETED:
      return 3;
  }
}

/**
 * Determines whether the `"Mua lại đơn này"` action is available for an order.
 * Subscription orders (`PaymentMethod.SUBSCRIPTION`) are excluded.
 *
 * @param order Customer order DTO.
 * @returns `true` when retail items can be re-added to the shopping cart.
 */
export function canReorderOrder(order: OrderDto): boolean {
  if (order.paymentMethod === PaymentMethod.SUBSCRIPTION) {
    return false;
  }
  if (order.items.length === 0) {
    return false;
  }
  return (
    order.orderStatus === OrderStatus.DELIVERED ||
    order.orderStatus === OrderStatus.COMPLETED ||
    order.orderStatus === OrderStatus.CANCELLED
  );
}

/**
 * Maps `OrderDto.items` into `StorefrontProduct` snapshots for `useCartStore.addItem`.
 * Sets `availableQuantity` to at least the ordered quantity so `/cart` can run
 * live `POST /api/v1/orders/validate-cart` stock and price reconciliation.
 *
 * @param items Order line items from `OrderDto`.
 * @returns Array of `{ product, quantity }` pairs ready for `useCartStore`.
 */
export function mapOrderItemsToCartEntries(items: OrderDto["items"]): readonly {
  readonly product: StorefrontProduct;
  readonly quantity: number;
}[] {
  return items.map((item) => ({
    quantity: item.quantity,
    product: {
      id: item.productId,
      slug: item.productSlug,
      name: item.productName,
      unit: item.unit,
      unitLabel: item.unit,
      basePriceVnd: item.unitPriceVnd,
      // Use a high placeholder ceiling so reordering an item already in the cart
      // does not clamp existing quantities before `/cart` runs `validate-cart`.
      availableQuantity: 999_999,
      imageUrl: item.productImageUrl ?? undefined,
      isRescueDeal: false,
      isSubscriptionEligible: false,
    },
  }));
}

/**
 * Summarizes order line items into a concise single-line preview for `/account/orders`.
 *
 * @param items Order line items.
 * @returns Formatted item preview string (e.g. `"Cà chua bi × 1.5, +2 sản phẩm khác"`).
 */
export function summarizeOrderItems(items: OrderDto["items"]): string {
  if (items.length === 0) {
    return "Không có sản phẩm";
  }
  const preview = items
    .slice(0, 2)
    .map((item) => `${item.productName} (${item.unit}) × ${item.quantity}`)
    .join(", ");
  const remaining = items.length - 2;
  return remaining > 0 ? `${preview} và ${remaining} sản phẩm khác` : preview;
}

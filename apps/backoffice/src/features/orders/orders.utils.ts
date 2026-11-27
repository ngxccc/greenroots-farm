import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  UserRole,
} from "@greenroots/shared";
import type { components } from "@/types/api-schema";

export type StaffOrderDto = components["schemas"]["StaffOrderDto"];
export type StaffOrderItemDto = StaffOrderDto["items"][number];
export type StaffOrderAllocationDto = StaffOrderItemDto["allocations"][number];
export type OrderPickListDto = components["schemas"]["OrderPickListDto"];
export type OrderPickListBatchDto = OrderPickListDto["batches"][number];

/** Filter values supported by the order queue status tabs. */
export type OrderStatusFilter = OrderStatus | "all";

/** Filter values supported by the subscription vs retail selector. */
export type SubscriptionFilter = "all" | "retail" | "subscription";

/** Staff roles authorized to confirm orders and manage fulfillment transitions. */
export const FULFILLMENT_ALLOWED_ROLES: readonly UserRole[] = [
  UserRole.SALES,
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
];

/** Order statuses eligible to fetch and print a warehouse pick list. */
export const PICK_LIST_ALLOWED_STATUSES: readonly OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.PACKING,
  OrderStatus.SHIPPING,
];

/**
 * Allowed target statuses for `PATCH /api/v1/orders/:id/status` keyed by current status.
 * Direct transitions into `confirmed` must go through `POST /api/v1/orders/:id/confirm`.
 */
export const ORDER_STATUS_TRANSITIONS: ReadonlyMap<
  OrderStatus,
  readonly OrderStatus[]
> = new Map<OrderStatus, readonly OrderStatus[]>([
  [OrderStatus.PENDING_PAYMENT, [OrderStatus.CANCELLED]],
  [OrderStatus.PENDING_CONFIRMATION, [OrderStatus.CANCELLED]],
  [OrderStatus.CONFIRMED, [OrderStatus.PACKING, OrderStatus.CANCELLED]],
  [OrderStatus.PACKING, [OrderStatus.SHIPPING, OrderStatus.CANCELLED]],
  [OrderStatus.SHIPPING, [OrderStatus.DELIVERED]],
  [OrderStatus.DELIVERED, [OrderStatus.COMPLETED]],
  [OrderStatus.COMPLETED, []],
  [OrderStatus.CANCELLED, []],
]);

/** Order statuses that hold active FEFO allocations requiring stock release on cancellation. */
export const ALLOCATED_CANCELLABLE_STATUSES: readonly OrderStatus[] = [
  OrderStatus.PENDING_PAYMENT,
  OrderStatus.PENDING_CONFIRMATION,
  OrderStatus.CONFIRMED,
  OrderStatus.PACKING,
];

/** Status filter tabs displayed above the fulfillment order table. */
export const ORDER_STATUS_TABS: readonly {
  readonly value: OrderStatusFilter;
  readonly label: string;
}[] = [
  { value: "all", label: "Tất cả" },
  { value: OrderStatus.PENDING_CONFIRMATION, label: "Chờ xác nhận" },
  { value: OrderStatus.CONFIRMED, label: "Đã xác nhận" },
  { value: OrderStatus.PACKING, label: "Đang đóng gói" },
  { value: OrderStatus.SHIPPING, label: "Đang giao" },
  { value: OrderStatus.DELIVERED, label: "Đã giao" },
  { value: OrderStatus.COMPLETED, label: "Hoàn tất" },
  { value: OrderStatus.PENDING_PAYMENT, label: "Chờ thanh toán" },
  { value: OrderStatus.CANCELLED, label: "Đã hủy" },
];

/** Options for filtering between retail and subscription auto-orders. */
export const SUBSCRIPTION_FILTER_OPTIONS: readonly {
  readonly value: SubscriptionFilter;
  readonly label: string;
}[] = [
  { value: "all", label: "Tất cả loại đơn" },
  { value: "retail", label: "Đơn lẻ" },
  { value: "subscription", label: "Gói định kỳ" },
];

/** Localized labels for `PaymentStatus` values in the backoffice order queue. */
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  [PaymentStatus.PENDING]: "Chờ thanh toán",
  [PaymentStatus.PAID]: "Đã thanh toán",
  [PaymentStatus.FAILED]: "Thanh toán lỗi",
  [PaymentStatus.CANCELLED]: "Đã hủy",
  [PaymentStatus.REFUNDED]: "Đã hoàn tiền",
};

/** Badge styling classes per `OrderStatus`. */
export const ORDER_STATUS_BADGE_CLASSES: Record<OrderStatus, string> = {
  [OrderStatus.PENDING_PAYMENT]: "border-amber-200 bg-amber-50 text-amber-800",
  [OrderStatus.PENDING_CONFIRMATION]:
    "border-amber-200 bg-amber-50 text-amber-800",
  [OrderStatus.CONFIRMED]: "border-emerald-200 bg-emerald-50 text-brand-dark",
  [OrderStatus.PACKING]: "border-sky-200 bg-sky-50 text-sky-800",
  [OrderStatus.SHIPPING]: "border-indigo-200 bg-indigo-50 text-indigo-800",
  [OrderStatus.DELIVERED]: "border-emerald-200 bg-emerald-50 text-brand-dark",
  [OrderStatus.COMPLETED]: "border-gray-200 bg-gray-100 text-gray-800",
  [OrderStatus.CANCELLED]: "border-red-200 bg-red-50 text-red-700",
};

const NEXT_FORWARD_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  [OrderStatus.CONFIRMED]: OrderStatus.PACKING,
  [OrderStatus.PACKING]: OrderStatus.SHIPPING,
  [OrderStatus.SHIPPING]: OrderStatus.DELIVERED,
  [OrderStatus.DELIVERED]: OrderStatus.COMPLETED,
};

const NEXT_FORWARD_ACTION_LABELS: Partial<Record<OrderStatus, string>> = {
  [OrderStatus.CONFIRMED]: "Đóng gói",
  [OrderStatus.PACKING]: "Xuất giao",
  [OrderStatus.SHIPPING]: "Đã giao",
  [OrderStatus.DELIVERED]: "Hoàn tất",
};

/**
 * Checks whether a staff user role is permitted to perform order fulfillment mutations.
 *
 * @param role Active staff role from `useAuthStore`.
 * @returns `true` when role is `sales`, `admin`, or `super_admin`.
 */
export function canManageOrderFulfillment(
  role: UserRole | null | undefined,
): boolean {
  if (!role) return false;
  return FULFILLMENT_ALLOWED_ROLES.includes(role);
}

/**
 * Determines whether an order can be confirmed via `POST /api/v1/orders/:id/confirm`.
 */
export function canConfirmOrderFefo(status: OrderStatus): boolean {
  return status === OrderStatus.PENDING_CONFIRMATION;
}

/**
 * Returns the next forward `OrderStatus` along the fulfillment FSM, or `null` if none exists.
 */
export function getNextForwardStatus(status: OrderStatus): OrderStatus | null {
  return NEXT_FORWARD_STATUS[status] ?? null;
}

/**
 * Returns the Vietnamese CTA label for advancing an order to its next forward status.
 */
export function getNextForwardActionLabel(status: OrderStatus): string | null {
  return NEXT_FORWARD_ACTION_LABELS[status] ?? null;
}

/**
 * Checks whether transitioning from `from` to `to` via `PATCH /status` is permitted by the FSM.
 */
export function canTransitionOrderStatus(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return ORDER_STATUS_TRANSITIONS.get(from)?.includes(to) ?? false;
}

/**
 * Checks whether an order can be cancelled from its current status.
 */
export function canCancelOrder(status: OrderStatus): boolean {
  return canTransitionOrderStatus(status, OrderStatus.CANCELLED);
}

/**
 * Checks whether cancelling an order in `status` will soft-release active FEFO allocations.
 */
export function doesCancellationReleaseStock(status: OrderStatus): boolean {
  return ALLOCATED_CANCELLABLE_STATUSES.includes(status);
}

/**
 * Checks whether an order status is eligible to fetch and print a warehouse pick list.
 */
export function isPickListEligible(status: OrderStatus): boolean {
  return PICK_LIST_ALLOWED_STATUSES.includes(status);
}

/**
 * Determines whether an order was generated as part of a recurring subscription.
 */
export function isSubscriptionOrder(
  order: Pick<StaffOrderDto, "subscriptionId">,
): boolean {
  return order.subscriptionId !== null;
}

export interface OrderCodDisplay {
  readonly isSubscription: boolean;
  readonly codVnd: number;
  readonly badgeLabel: string | null;
  readonly paymentStatusLabel: string;
}

/**
 * Resolves subscription indicator, COD collection amount, and payment status label for an order.
 *
 * @param order Order payment and subscription fields.
 * @returns Structured display metadata with `COD: 0đ` for prepaid subscription orders.
 */
export function getOrderCodDisplay(
  order: Pick<
    StaffOrderDto,
    "subscriptionId" | "paymentMethod" | "paymentStatus" | "totalAmountVnd"
  >,
): OrderCodDisplay {
  if (isSubscriptionOrder(order)) {
    return {
      isSubscription: true,
      codVnd: 0,
      badgeLabel: "Gói định kỳ · COD: 0đ",
      paymentStatusLabel: PAYMENT_STATUS_LABELS[PaymentStatus.PAID],
    };
  }

  const codVnd =
    order.paymentMethod === PaymentMethod.COD &&
    order.paymentStatus !== PaymentStatus.PAID
      ? order.totalAmountVnd
      : 0;

  return {
    isSubscription: false,
    codVnd,
    badgeLabel: null,
    paymentStatusLabel: PAYMENT_STATUS_LABELS[order.paymentStatus],
  };
}

export interface ActiveOrderAllocation {
  readonly allocationId: string;
  readonly productId: string;
  readonly productName: string;
  readonly unit: string;
  readonly batchCode: string;
  readonly expirationDate: string;
  readonly allocatedQuantity: number;
}

/**
 * Collects all non-released FEFO batch allocations across an order's line items,
 * sorted by earliest expiration date first.
 */
export function getActiveAllocations(
  order: Pick<StaffOrderDto, "items">,
): ActiveOrderAllocation[] {
  const result: ActiveOrderAllocation[] = [];
  for (const item of order.items) {
    for (const allocation of item.allocations) {
      if (allocation.releasedAt !== null) {
        continue;
      }
      result.push({
        allocationId: allocation.id,
        productId: item.productId,
        productName: item.productName,
        unit: item.unit,
        batchCode: allocation.batchCode,
        expirationDate: allocation.expirationDate,
        allocatedQuantity: allocation.allocatedQuantity,
      });
    }
  }
  return result.sort(
    (a, b) =>
      new Date(a.expirationDate).getTime() -
      new Date(b.expirationDate).getTime(),
  );
}

export interface GroupedPickListBatch {
  readonly batchCode: string;
  readonly expirationDate: string;
  readonly batchStatus: OrderPickListBatchDto["batchStatus"];
  readonly isExpired: boolean;
  readonly items: readonly {
    readonly productId: string;
    readonly productName: string;
    readonly unit: string;
    readonly allocatedQuantity: number;
  }[];
}

/**
 * Groups pick-list entries by `batchCode` and orders batches by earliest expiration date first (FEFO).
 */
export function groupPickListByBatch(
  pickList: OrderPickListDto,
): GroupedPickListBatch[] {
  const groups = new Map<
    string,
    {
      batchCode: string;
      expirationDate: string;
      batchStatus: OrderPickListBatchDto["batchStatus"];
      isExpired: boolean;
      items: {
        productId: string;
        productName: string;
        unit: string;
        allocatedQuantity: number;
      }[];
    }
  >();

  for (const entry of pickList.batches) {
    const existing = groups.get(entry.batchCode);
    const item = {
      productId: entry.productId,
      productName: entry.productName,
      unit: entry.unit,
      allocatedQuantity: entry.allocatedQuantity,
    };
    if (existing) {
      existing.items.push(item);
      existing.isExpired = existing.isExpired || entry.isExpired;
    } else {
      groups.set(entry.batchCode, {
        batchCode: entry.batchCode,
        expirationDate: entry.expirationDate,
        batchStatus: entry.batchStatus,
        isExpired: entry.isExpired,
        items: [item],
      });
    }
  }

  return Array.from(groups.values()).sort(
    (a, b) =>
      new Date(a.expirationDate).getTime() -
      new Date(b.expirationDate).getTime(),
  );
}

/**
 * Formats an integer VND amount with `vi-VN` grouping and `đ` suffix.
 */
export function formatVnd(amount: number): string {
  return `${Math.round(amount).toLocaleString("vi-VN")}đ`;
}

/**
 * Formats an ISO timestamp in `Asia/Ho_Chi_Minh` timezone (`dd/MM/yyyy HH:mm`).
 */
export function formatViDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * Formats an ISO date in `Asia/Ho_Chi_Minh` timezone (`dd/MM/yyyy`).
 */
export function formatViDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/**
 * Derives a delivery-day / route grouping cue in `Asia/Ho_Chi_Minh` timezone
 * to help staff group Tuesday/Friday subscription runs and local delivery routes.
 */
export function getDeliveryScheduleCue(
  createdAtIso: string,
  shippingAddress: string,
): { readonly dayLabel: string; readonly routeCue: string } {
  const date = new Date(createdAtIso);
  const weekday = Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        weekday: "long",
      }).format(date);

  const normalizedAddress = shippingAddress.trim();
  const segments = normalizedAddress
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const districtSegment =
    segments.length >= 2 ? segments[segments.length - 2] : segments[0];

  return {
    dayLabel: weekday ? `Tuyến ${weekday}` : "Tuyến giao trong ngày",
    routeCue: districtSegment ?? "TP.HCM",
  };
}

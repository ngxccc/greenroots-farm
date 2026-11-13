import { DeliveryDay, OrderStatus, PaymentMethod } from "./domain.enums";

/**
 * Shared Vietnamese display labels for cross-app transactional enums (Q2-B).
 * Surface-specific labels (e.g. customer vs backoffice batch statuses) live in each app.
 */
export const DELIVERY_DAY_LABELS: Record<DeliveryDay, string> = {
  [DeliveryDay.TUESDAY]: "Thứ 3 hàng tuần",
  [DeliveryDay.FRIDAY]: "Thứ 6 hàng tuần",
  [DeliveryDay.BOTH]: "Thứ 3 & Thứ 6 hàng tuần",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  [PaymentMethod.COD]: "Tiền mặt khi nhận hàng (COD)",
  [PaymentMethod.PAYOS]: "Chuyển khoản VietQR (PayOS)",
  [PaymentMethod.SUBSCRIPTION]: "Trừ lượt Gói định kỳ",
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.PENDING_PAYMENT]: "Chờ thanh toán",
  [OrderStatus.PENDING_CONFIRMATION]: "Chờ xác nhận",
  [OrderStatus.PACKING]: "Đang đóng gói",
  [OrderStatus.SHIPPING]: "Đang giao hỏa tốc",
  [OrderStatus.DELIVERED]: "Đã giao thành công",
  [OrderStatus.COMPLETED]: "Hoàn tất",
  [OrderStatus.CANCELLED]: "Đã hủy",
};

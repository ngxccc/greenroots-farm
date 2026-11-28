import {
  PAYMENT_METHOD_LABELS,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
  UserRole,
} from "@greenroots/shared";
import type { components } from "@/types/api-schema";

export type PaymentLedgerItemDto =
  components["schemas"]["PaymentLedgerItemDto"];
export type FinanceAnalyticsDto = components["schemas"]["FinanceAnalyticsDto"];
export type CashflowSeriesPointDto =
  FinanceAnalyticsDto["cashflowSeries"][number];

/** Filter values supported by the payment method selector. */
export type PaymentMethodFilter = PaymentMethod | "all";

/** Filter values supported by the payment status selector. */
export type PaymentStatusFilter = PaymentStatus | "all";

/** Filter values supported by the transaction type selector. */
export type PaymentTransactionTypeFilter = PaymentTransactionType | "all";

/** Granularity options supported by `GET /api/v1/analytics/finance`. */
export type CashflowGranularity = FinanceAnalyticsDto["period"]["granularity"];

/** Staff roles authorized to view the payment ledger and confirm COD collection. */
export const PAYMENT_LEDGER_ALLOWED_ROLES: readonly UserRole[] = [
  UserRole.SALES,
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
];

/** Payment method filter options rendered in the ledger toolbar. */
export const PAYMENT_METHOD_FILTER_OPTIONS: readonly {
  readonly value: PaymentMethodFilter;
  readonly label: string;
}[] = [
  { value: "all", label: "Tất cả phương thức" },
  {
    value: PaymentMethod.PAYOS,
    label: PAYMENT_METHOD_LABELS[PaymentMethod.PAYOS],
  },
  { value: PaymentMethod.COD, label: PAYMENT_METHOD_LABELS[PaymentMethod.COD] },
  {
    value: PaymentMethod.SUBSCRIPTION,
    label: PAYMENT_METHOD_LABELS[PaymentMethod.SUBSCRIPTION],
  },
];

/** Payment status filter options rendered in the ledger toolbar. */
export const PAYMENT_STATUS_FILTER_OPTIONS: readonly {
  readonly value: PaymentStatusFilter;
  readonly label: string;
}[] = [
  { value: "all", label: "Tất cả trạng thái" },
  { value: PaymentStatus.PENDING, label: "Chờ thanh toán" },
  { value: PaymentStatus.PAID, label: "Đã thanh toán" },
  { value: PaymentStatus.FAILED, label: "Thanh toán lỗi" },
  { value: PaymentStatus.CANCELLED, label: "Đã hủy" },
  { value: PaymentStatus.REFUNDED, label: "Đã hoàn tiền" },
];

/** Transaction type filter options rendered in the ledger toolbar. */
export const TRANSACTION_TYPE_FILTER_OPTIONS: readonly {
  readonly value: PaymentTransactionTypeFilter;
  readonly label: string;
}[] = [
  { value: "all", label: "Tất cả giao dịch" },
  { value: PaymentTransactionType.PAYMENT, label: "Thu tiền" },
  { value: PaymentTransactionType.REFUND, label: "Hoàn tiền" },
];

/** Granularity options rendered in the SuperAdmin cashflow toolbar. */
export const CASHFLOW_GRANULARITY_OPTIONS: readonly {
  readonly value: CashflowGranularity;
  readonly label: string;
}[] = [
  { value: "day", label: "Theo ngày" },
  { value: "week", label: "Theo tuần" },
  { value: "month", label: "Theo tháng" },
];

/** Localized labels for `PaymentStatus` values in the payment ledger. */
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  [PaymentStatus.PENDING]: "Chờ thanh toán",
  [PaymentStatus.PAID]: "Đã thanh toán",
  [PaymentStatus.FAILED]: "Thanh toán lỗi",
  [PaymentStatus.CANCELLED]: "Đã hủy",
  [PaymentStatus.REFUNDED]: "Đã hoàn tiền",
};

/** Badge styling classes per `PaymentStatus`. */
export const PAYMENT_STATUS_BADGE_CLASSES: Record<PaymentStatus, string> = {
  [PaymentStatus.PENDING]: "border-amber-200 bg-amber-50 text-amber-800",
  [PaymentStatus.PAID]: "border-emerald-200 bg-emerald-50 text-brand-dark",
  [PaymentStatus.FAILED]: "border-red-200 bg-red-50 text-red-700",
  [PaymentStatus.CANCELLED]: "border-gray-200 bg-gray-100 text-gray-700",
  [PaymentStatus.REFUNDED]: "border-sky-200 bg-sky-50 text-sky-800",
};

/** Localized labels for `PaymentTransactionType`. */
export const TRANSACTION_TYPE_LABELS: Record<PaymentTransactionType, string> = {
  [PaymentTransactionType.PAYMENT]: "Thu tiền",
  [PaymentTransactionType.REFUND]: "Hoàn tiền",
};

/** Reconciliation badge descriptor for PayOS webhook and COD verification states. */
export interface ReconciliationBadgeInfo {
  readonly label: string;
  readonly detail: string | null;
  readonly tone: "matched" | "pending" | "issue" | "manual" | "neutral";
  readonly className: string;
}

/**
 * Checks whether the active staff user is strictly `super_admin` and allowed
 * to fetch and view cashflow analytics (`GET /api/v1/analytics/finance`).
 *
 * @param role Active staff role from `useAuthStore`.
 * @returns `true` only for `super_admin`; `false` for `sales`, `admin`, and all other roles.
 */
export function canViewSuperAdminCashflow(
  role: UserRole | null | undefined,
): boolean {
  return role === UserRole.SUPER_ADMIN;
}

/**
 * Checks whether a staff role is authorized to confirm pending COD collections.
 *
 * @param role Active staff role from `useAuthStore`.
 * @returns `true` for `sales`, `admin`, and `super_admin`.
 */
export function canConfirmCodRole(role: UserRole | null | undefined): boolean {
  if (!role) return false;
  return PAYMENT_LEDGER_ALLOWED_ROLES.includes(role);
}

/**
 * Determines whether a payment ledger row is eligible for manual COD confirmation.
 *
 * @param payment Payment ledger row from `GET /api/v1/payments`.
 * @param role Active staff role from `useAuthStore`.
 * @returns `true` when the row is a pending COD payment (not refund) and the role is authorized.
 */
export function canConfirmCodPayment(
  payment: Pick<
    PaymentLedgerItemDto,
    "paymentMethod" | "status" | "transactionType"
  >,
  role: UserRole | null | undefined,
): boolean {
  if (!canConfirmCodRole(role)) return false;
  return (
    payment.paymentMethod === PaymentMethod.COD &&
    payment.status === PaymentStatus.PENDING &&
    payment.transactionType === PaymentTransactionType.PAYMENT
  );
}

/**
 * Derives the PayOS webhook / COD reconciliation badge for a payment ledger row.
 *
 * @param payment Payment ledger row from `GET /api/v1/payments`.
 * @returns Structured badge label, optional secondary detail, tone, and Tailwind classes.
 */
export function getReconciliationBadge(
  payment: Pick<
    PaymentLedgerItemDto,
    | "paymentMethod"
    | "status"
    | "transactionType"
    | "payosOrderCode"
    | "referenceCode"
    | "verifiedByName"
  >,
): ReconciliationBadgeInfo {
  if (payment.paymentMethod === PaymentMethod.PAYOS) {
    if (payment.transactionType === PaymentTransactionType.REFUND) {
      return {
        label: "Hoàn tiền đối soát",
        detail: payment.referenceCode ?? null,
        tone: "neutral",
        className: "border-sky-200 bg-sky-50 text-sky-800",
      };
    }

    if (
      payment.status === PaymentStatus.PAID ||
      payment.status === PaymentStatus.REFUNDED
    ) {
      return {
        label: "Webhook PayOS khớp",
        detail: payment.payosOrderCode
          ? `Mã PayOS #${payment.payosOrderCode}`
          : payment.referenceCode,
        tone: "matched",
        className: "border-emerald-200 bg-emerald-50 text-brand-dark",
      };
    }

    if (payment.status === PaymentStatus.PENDING) {
      return {
        label: "Chờ webhook PayOS",
        detail: payment.payosOrderCode
          ? `Mã PayOS #${payment.payosOrderCode}`
          : null,
        tone: "pending",
        className: "border-amber-200 bg-amber-50 text-amber-800",
      };
    }

    return {
      label: "Chưa khớp PayOS",
      detail: payment.payosOrderCode
        ? `Mã PayOS #${payment.payosOrderCode}`
        : null,
      tone: "issue",
      className: "border-red-200 bg-red-50 text-red-700",
    };
  }

  if (payment.paymentMethod === PaymentMethod.COD) {
    if (payment.status === PaymentStatus.PAID) {
      return {
        label: "COD đã đối soát",
        detail: payment.verifiedByName
          ? `Xác nhận: ${payment.verifiedByName}`
          : null,
        tone: "manual",
        className: "border-emerald-200 bg-emerald-50 text-brand-dark",
      };
    }

    if (payment.status === PaymentStatus.PENDING) {
      return {
        label: "Chờ thu hộ COD",
        detail: null,
        tone: "pending",
        className: "border-amber-200 bg-amber-50 text-amber-800",
      };
    }

    return {
      label: "COD đã đóng",
      detail: null,
      tone: "neutral",
      className: "border-gray-200 bg-gray-100 text-gray-700",
    };
  }

  return {
    label: "Gói định kỳ tự động",
    detail: null,
    tone: "neutral",
    className: "border-gray-200 bg-gray-100 text-gray-700",
  };
}

/**
 * Formats an integer VND amount with `vi-VN` grouping and `đ` suffix.
 */
export function formatVnd(amount: number): string {
  return `${Math.round(amount).toLocaleString("vi-VN")}đ`;
}

/**
 * Formats an integer VND amount with an explicit sign for ledger inflows/outflows.
 */
export function formatSignedLedgerAmount(
  amountVnd: number,
  transactionType: PaymentTransactionType,
): string {
  const formatted = formatVnd(Math.abs(amountVnd));
  return transactionType === PaymentTransactionType.REFUND
    ? `-${formatted}`
    : formatted;
}

/**
 * Formats large VND amounts into compact axis labels (e.g. `1,5 tr`, `500 k`).
 */
export function formatCompactVnd(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs >= 1_000_000) {
    const millions = abs / 1_000_000;
    const formatted = Number.isInteger(millions)
      ? millions.toString()
      : millions.toFixed(1).replace(".", ",");
    return `${sign}${formatted} tr`;
  }
  if (abs >= 1_000) {
    return `${sign}${Math.round(abs / 1_000)} k`;
  }
  return `${sign}${Math.round(abs)}đ`;
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
 * Formats a cashflow time-series bucket label (`YYYY-MM-DD` or `YYYY-MM`) for chart axes.
 */
export function formatCashflowBucketLabel(
  bucket: string,
  granularity: CashflowGranularity,
): string {
  if (granularity === "month") {
    const match = /^(\d{4})-(\d{2})$/.exec(bucket);
    if (match) {
      return `${match[2]}/${match[1]}`;
    }
  }
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bucket);
  if (dateMatch) {
    return `${dateMatch[3]}/${dateMatch[2]}`;
  }
  return bucket;
}

/**
 * Returns default `from` and `to` ISO date strings (`YYYY-MM-DD`) in `Asia/Ho_Chi_Minh`
 * covering the last `days` days (inclusive of today).
 */
export function getDefaultCashflowDateRange(days = 30): {
  readonly from: string;
  readonly to: string;
} {
  const now = new Date();
  const toFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const to = toFormatter.format(now);
  const fromDate = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const from = toFormatter.format(fromDate);
  return { from, to };
}

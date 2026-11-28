import {
  ComplaintCategory,
  ComplaintRefundChannel,
  ComplaintResolution,
  ComplaintStatus,
  UserRole,
} from "@greenroots/shared";
import type { components } from "@/types/api-schema";

export type StaffComplaintDto = components["schemas"]["StaffComplaintDto"];
export type TriageComplaintDto = components["schemas"]["TriageComplaintDto"];
export type ResolveComplaintDto = components["schemas"]["ResolveComplaintDto"];
export type ComplaintOrderDetailDto = components["schemas"]["OrderDto"];

/** Filter values supported by the complaint status tabs. */
export type ComplaintStatusFilter = ComplaintStatus | "all";

/** Minimum length required for a rejection rationale in `TriageComplaintDto.triageNote`. */
export const TRIAGE_REJECT_NOTE_MIN_LENGTH = 5;

/** Maximum length permitted for `triageNote` and `resolutionNote`. */
export const COMPLAINT_NOTE_MAX_LENGTH = 500;

/** Maximum length permitted for `ResolveComplaintDto.referenceCode`. */
export const REFUND_REFERENCE_MAX_LENGTH = 100;

/** Status filter tabs displayed above the complaints table. */
export const COMPLAINT_STATUS_TABS: readonly {
  readonly value: ComplaintStatusFilter;
  readonly label: string;
}[] = [
  { value: ComplaintStatus.PENDING, label: "Chờ phân loại" },
  { value: ComplaintStatus.TRIAGED, label: "Đã tiếp nhận" },
  { value: ComplaintStatus.APPROVED, label: "Đã xử lý" },
  { value: ComplaintStatus.REJECTED, label: "Đã từ chối" },
  { value: "all", label: "Tất cả" },
];

export interface ComplaintStatusMeta {
  readonly label: string;
  readonly badgeClassName: string;
}

/** Display metadata for each `ComplaintStatus` value. */
export const COMPLAINT_STATUS_META: Record<
  ComplaintStatus,
  ComplaintStatusMeta
> = {
  [ComplaintStatus.PENDING]: {
    label: "Chờ phân loại",
    badgeClassName: "border-amber-200 bg-amber-50 text-amber-800",
  },
  [ComplaintStatus.TRIAGED]: {
    label: "Đã tiếp nhận",
    badgeClassName: "border-sky-200 bg-sky-50 text-sky-800",
  },
  [ComplaintStatus.APPROVED]: {
    label: "Đã xử lý",
    badgeClassName: "border-emerald-200 bg-emerald-50 text-brand-dark",
  },
  [ComplaintStatus.REJECTED]: {
    label: "Đã từ chối",
    badgeClassName: "border-red-200 bg-red-50 text-red-700",
  },
};

/** Vietnamese labels for `ComplaintCategory`. */
export const COMPLAINT_CATEGORY_LABELS: Record<ComplaintCategory, string> = {
  [ComplaintCategory.DAMAGED_WILTED]: "Hư hỏng / Dập nát",
  [ComplaintCategory.MISSING_ITEM]: "Thiếu sản phẩm",
  [ComplaintCategory.WRONG_ITEM]: "Giao sai sản phẩm",
  [ComplaintCategory.NOT_FRESH]: "Không tươi như cam kết",
  [ComplaintCategory.OTHER]: "Vấn đề khác",
};

/** Vietnamese labels for `ComplaintResolution`. */
export const COMPLAINT_RESOLUTION_LABELS: Record<ComplaintResolution, string> =
  {
    [ComplaintResolution.REFUND]: "Hoàn tiền",
    [ComplaintResolution.REPLACEMENT]: "Đơn bù 0đ (FEFO)",
  };

/** Vietnamese labels for `ComplaintRefundChannel`. */
export const COMPLAINT_REFUND_CHANNEL_LABELS: Record<
  ComplaintRefundChannel,
  string
> = {
  [ComplaintRefundChannel.BANK_TRANSFER]: "Chuyển khoản ngân hàng",
  [ComplaintRefundChannel.LOYALTY_POINTS]: "Cộng điểm tích lũy",
};

/**
 * Returns `true` when the staff role is allowed to view and triage customer complaints.
 *
 * @param role Active staff role from `useAuthStore`.
 */
export function canViewAndTriageComplaints(
  role: UserRole | null | undefined,
): boolean {
  return (
    role === UserRole.SALES ||
    role === UserRole.ADMIN ||
    role === UserRole.SUPER_ADMIN
  );
}

/**
 * Returns `true` when the staff role is allowed to resolve complaints with refund or replacement.
 *
 * @param role Active staff role from `useAuthStore`.
 */
export function canResolveComplaints(
  role: UserRole | null | undefined,
): boolean {
  return role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
}

export interface ComplaintTriageGuardResult {
  readonly canTriage: boolean;
  readonly canReject: boolean;
  readonly isOverrideMode: boolean;
  readonly reason: string | null;
}

/**
 * Evaluates whether the current staff role can triage or reject a complaint in its current status.
 *
 * @param status Current complaint status.
 * @param role Active staff role from `useAuthStore`.
 */
export function evaluateTriageGuard(
  status: ComplaintStatus,
  role: UserRole | null | undefined,
): ComplaintTriageGuardResult {
  if (!canViewAndTriageComplaints(role)) {
    return {
      canTriage: false,
      canReject: false,
      isOverrideMode: false,
      reason:
        "Chỉ nhân viên Kinh doanh (Sales) hoặc Quản trị viên mới có quyền phân loại khiếu nại.",
    };
  }

  if (status === ComplaintStatus.PENDING) {
    return {
      canTriage: true,
      canReject: true,
      isOverrideMode: false,
      reason: null,
    };
  }

  if (status === ComplaintStatus.TRIAGED && canResolveComplaints(role)) {
    return {
      canTriage: false,
      canReject: true,
      isOverrideMode: true,
      reason: null,
    };
  }

  return {
    canTriage: false,
    canReject: false,
    isOverrideMode: false,
    reason: null,
  };
}

export interface ComplaintResolveGuardResult {
  readonly canResolve: boolean;
  readonly reason: string | null;
}

/**
 * Evaluates whether the current staff role can resolve a complaint (refund or 0đ replacement).
 *
 * @param status Current complaint status.
 * @param role Active staff role from `useAuthStore`.
 */
export function evaluateResolveGuard(
  status: ComplaintStatus,
  role: UserRole | null | undefined,
): ComplaintResolveGuardResult {
  if (status !== ComplaintStatus.TRIAGED) {
    return {
      canResolve: false,
      reason:
        status === ComplaintStatus.PENDING
          ? "Khiếu nại cần được tiếp nhận (phân loại) trước khi xử lý bồi hoàn."
          : null,
    };
  }

  if (!canResolveComplaints(role)) {
    return {
      canResolve: false,
      reason:
        "Tài khoản Kinh doanh (Sales) chỉ có quyền phân loại. Chỉ Quản trị viên (Admin) mới được phép hoàn tiền hoặc tạo đơn bù 0đ.",
    };
  }

  return {
    canResolve: true,
    reason: null,
  };
}

export type PayloadBuildResult<T> =
  | { readonly ok: true; readonly payload: T }
  | { readonly ok: false; readonly error: string };

/**
 * Validates and builds a `TriageComplaintDto` payload for `PATCH /api/v1/complaints/{id}/triage`.
 *
 * @param status Target triage status (`triaged` or `rejected`).
 * @param rawNote Staff triage or rejection rationale.
 */
export function buildTriagePayload(
  status: "triaged" | "rejected",
  rawNote: string,
): PayloadBuildResult<TriageComplaintDto> {
  const trimmed = rawNote.trim();

  if (trimmed.length > COMPLAINT_NOTE_MAX_LENGTH) {
    return {
      ok: false,
      error: `Ghi chú phân loại tối đa ${COMPLAINT_NOTE_MAX_LENGTH} ký tự.`,
    };
  }

  if (status === "rejected" && trimmed.length < TRIAGE_REJECT_NOTE_MIN_LENGTH) {
    return {
      ok: false,
      error: `Vui lòng nhập lý do từ chối tối thiểu ${TRIAGE_REJECT_NOTE_MIN_LENGTH} ký tự.`,
    };
  }

  return {
    ok: true,
    payload: {
      status,
      ...(trimmed.length > 0 ? { triageNote: trimmed } : {}),
    },
  };
}

export interface ResolveRefundInput {
  readonly resolution: typeof ComplaintResolution.REFUND;
  readonly refundChannel: ComplaintRefundChannel;
  readonly refundAmountVnd: number;
  readonly orderTotalVnd: number;
  readonly referenceCode?: string;
  readonly resolutionNote?: string;
}

export interface ResolveReplacementItemInput {
  readonly productId: string;
  readonly quantity: number;
  readonly maxQuantity: number;
}

export interface ResolveReplacementInput {
  readonly resolution: typeof ComplaintResolution.REPLACEMENT;
  readonly mode: "full" | "partial";
  readonly items?: readonly ResolveReplacementItemInput[];
  readonly resolutionNote?: string;
}

export type ResolveFormInput = ResolveRefundInput | ResolveReplacementInput;

/**
 * Validates and builds a `ResolveComplaintDto` payload for `POST /api/v1/complaints/{id}/resolve`.
 *
 * @param input Form values for refund or 0đ replacement resolution.
 */
export function buildResolvePayload(
  input: ResolveFormInput,
): PayloadBuildResult<ResolveComplaintDto> {
  const trimmedNote = input.resolutionNote?.trim() ?? "";
  if (trimmedNote.length > COMPLAINT_NOTE_MAX_LENGTH) {
    return {
      ok: false,
      error: `Ghi chú xử lý tối đa ${COMPLAINT_NOTE_MAX_LENGTH} ký tự.`,
    };
  }

  if (input.resolution === ComplaintResolution.REFUND) {
    if (
      !Number.isInteger(input.refundAmountVnd) ||
      input.refundAmountVnd <= 0
    ) {
      return {
        ok: false,
        error: "Số tiền hoàn phải là số nguyên dương (VNĐ).",
      };
    }

    if (input.refundAmountVnd > input.orderTotalVnd) {
      return {
        ok: false,
        error: `Số tiền hoàn không được vượt quá tổng đơn hàng (${formatVnd(input.orderTotalVnd)}).`,
      };
    }

    const trimmedRef = input.referenceCode?.trim() ?? "";
    if (trimmedRef.length > REFUND_REFERENCE_MAX_LENGTH) {
      return {
        ok: false,
        error: `Mã tham chiếu giao dịch tối đa ${REFUND_REFERENCE_MAX_LENGTH} ký tự.`,
      };
    }

    return {
      ok: true,
      payload: {
        resolution: ComplaintResolution.REFUND,
        refundChannel: input.refundChannel,
        refundAmountVnd: input.refundAmountVnd,
        ...(input.refundChannel === ComplaintRefundChannel.BANK_TRANSFER &&
        trimmedRef.length > 0
          ? { referenceCode: trimmedRef }
          : {}),
        ...(trimmedNote.length > 0 ? { resolutionNote: trimmedNote } : {}),
      },
    };
  }

  if (input.mode === "partial") {
    const items = input.items ?? [];
    if (items.length === 0) {
      return {
        ok: false,
        error: "Vui lòng chọn ít nhất một sản phẩm để tạo đơn bù 0đ.",
      };
    }

    const normalizedItems: { productId: string; quantity: number }[] = [];
    for (const item of items) {
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
        return {
          ok: false,
          error: "Số lượng sản phẩm bù phải lớn hơn 0.",
        };
      }
      if (item.quantity > item.maxQuantity) {
        return {
          ok: false,
          error: "Số lượng sản phẩm bù không được vượt quá số lượng đơn gốc.",
        };
      }
      normalizedItems.push({
        productId: item.productId,
        quantity: Math.round(item.quantity * 100) / 100,
      });
    }

    return {
      ok: true,
      payload: {
        resolution: ComplaintResolution.REPLACEMENT,
        items: normalizedItems,
        ...(trimmedNote.length > 0 ? { resolutionNote: trimmedNote } : {}),
      },
    };
  }

  return {
    ok: true,
    payload: {
      resolution: ComplaintResolution.REPLACEMENT,
      ...(trimmedNote.length > 0 ? { resolutionNote: trimmedNote } : {}),
    },
  };
}

/**
 * Validates that a complaint media URL uses `https:` or `http:` before rendering
 * `<img>`, `<video>`, or `<a>`, blocking unsafe schemes such as `javascript:` or `data:`.
 *
 * @param rawUrl Candidate proof image or video URL from `StaffComplaintDto`.
 */
export function isSafeMediaUrl(rawUrl: string | null | undefined): boolean {
  if (!rawUrl) {
    return false;
  }
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Filters an array of candidate proof media URLs down to safe `https:`/`http:` URLs.
 *
 * @param urls Candidate URL list from `StaffComplaintDto.proofImageUrls`.
 */
export function filterSafeMediaUrls(urls: readonly string[]): string[] {
  return urls.filter((url) => isSafeMediaUrl(url));
}

/**
 * Formats an integer VND amount using Vietnamese locale grouping.
 *
 * @param amount Integer VND amount.
 */
export function formatVnd(amount: number): string {
  return `${Math.round(amount).toLocaleString("vi-VN")}đ`;
}

/**
 * Formats an ISO-8601 timestamp into Vietnamese `DD/MM/YYYY HH:mm` local time.
 *
 * @param isoTimestamp ISO-8601 timestamp string or null.
 */
export function formatViDateTime(
  isoTimestamp: string | null | undefined,
): string {
  if (!isoTimestamp) {
    return "—";
  }
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

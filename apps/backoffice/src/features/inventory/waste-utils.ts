import { UserRole, WasteLogStatus } from "@greenroots/shared";
import type { components } from "@/types/api-schema";

export type WasteLogDto = components["schemas"]["WasteLogDto"];
export type RejectWasteLogDto = components["schemas"]["RejectWasteLogDto"];

/** Filter values supported by the waste approval status tabs. */
export type WasteStatusFilter = WasteLogStatus | "all";

/** Maximum length permitted for `RejectWasteLogDto.rejectionReason` (matches API schema). */
export const REJECTION_REASON_MAX_LENGTH = 500;

/** Status filter tabs displayed above the waste proposal table. */
export const WASTE_STATUS_TABS: readonly {
  readonly value: WasteStatusFilter;
  readonly label: string;
}[] = [
  { value: WasteLogStatus.PENDING_APPROVAL, label: "Chờ duyệt" },
  { value: WasteLogStatus.APPROVED, label: "Đã duyệt" },
  { value: WasteLogStatus.REJECTED, label: "Từ chối" },
  { value: "all", label: "Tất cả" },
];

export interface WasteStatusMeta {
  readonly label: string;
  readonly badgeClassName: string;
}

/** Display metadata for each `WasteLogStatus` value. */
export const WASTE_STATUS_META: Record<WasteLogStatus, WasteStatusMeta> = {
  [WasteLogStatus.PENDING_APPROVAL]: {
    label: "Chờ duyệt",
    badgeClassName: "border-amber-200 bg-amber-50 text-amber-800",
  },
  [WasteLogStatus.APPROVED]: {
    label: "Đã duyệt",
    badgeClassName: "border-emerald-200 bg-emerald-50 text-brand-dark",
  },
  [WasteLogStatus.REJECTED]: {
    label: "Từ chối",
    badgeClassName: "border-red-200 bg-red-50 text-red-700",
  },
};

export interface WasteReviewGuardResult {
  readonly canReview: boolean;
  readonly isSelfProposal: boolean;
  readonly reason: string | null;
}

/**
 * Evaluates whether the current staff user can approve or reject a waste log.
 * Enforces the 4-eyes non-self-review rule alongside admin role and pending-status checks.
 *
 * @param wasteLog Target waste write-off proposal.
 * @param currentUser Active authenticated staff user from `useAuthStore`.
 * @returns Guard evaluation with `canReview`, `isSelfProposal`, and localized block reason.
 */
export function evaluateWasteReviewGuard(
  wasteLog: Pick<WasteLogDto, "status" | "reporter">,
  currentUser:
    | { readonly id: string; readonly role: UserRole }
    | null
    | undefined,
): WasteReviewGuardResult {
  if (wasteLog.status !== WasteLogStatus.PENDING_APPROVAL) {
    return {
      canReview: false,
      isSelfProposal: false,
      reason: null,
    };
  }

  if (!currentUser) {
    return {
      canReview: false,
      isSelfProposal: false,
      reason: "Không xác định được tài khoản quản trị hiện tại.",
    };
  }

  if (
    currentUser.role !== UserRole.ADMIN &&
    currentUser.role !== UserRole.SUPER_ADMIN
  ) {
    return {
      canReview: false,
      isSelfProposal: false,
      reason:
        "Chỉ Quản trị viên mới có quyền phê duyệt hoặc từ chối phiếu xuất hủy.",
    };
  }

  if (currentUser.id === wasteLog.reporter.id) {
    return {
      canReview: false,
      isSelfProposal: true,
      reason:
        "Nguyên tắc 4 mắt: Bạn là người đề xuất phiếu xuất hủy này nên không thể tự phê duyệt hoặc từ chối.",
    };
  }

  return {
    canReview: true,
    isSelfProposal: false,
    reason: null,
  };
}

export type RejectionReasonValidation =
  | { readonly valid: true; readonly value: string }
  | { readonly valid: false; readonly error: string };

/**
 * Validates and trims a waste log rejection reason before submitting `RejectWasteLogDto`.
 *
 * @param rawReason Raw textarea value entered by the reviewer.
 * @returns Normalized reason when valid, or a localized Vietnamese error message.
 */
export function validateRejectionReason(
  rawReason: string,
): RejectionReasonValidation {
  const trimmed = rawReason.trim();
  if (trimmed.length === 0) {
    return {
      valid: false,
      error: "Vui lòng nhập lý do từ chối phiếu xuất hủy.",
    };
  }

  if (trimmed.length > REJECTION_REASON_MAX_LENGTH) {
    return {
      valid: false,
      error: `Lý do từ chối tối đa ${REJECTION_REASON_MAX_LENGTH} ký tự.`,
    };
  }

  return {
    valid: true,
    value: trimmed,
  };
}

/**
 * Validates that a proof media URL uses HTTPS so unsafe schemes (`javascript:`, `data:`, `http:`)
 * cannot be rendered as clickable links or image sources.
 *
 * @param rawUrl Candidate proof image URL from `WasteLogDto.mediaUrls`.
 * @returns `true` when the URL parses cleanly with `https:` protocol.
 */
export function isSafeProofMediaUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Filters `WasteLogDto.mediaUrls` down to validated HTTPS URLs while preserving order.
 *
 * @param mediaUrls Raw array of proof media URLs.
 * @returns Validated HTTPS URLs safe for rendering.
 */
export function filterSafeProofMediaUrls(
  mediaUrls: readonly string[],
): string[] {
  return mediaUrls.map((url) => url.trim()).filter(isSafeProofMediaUrl);
}

/**
 * Computes the projected batch stock after an approved write-off and flags stock deficits.
 *
 * @param availableQuantity Current sellable batch quantity.
 * @param discardedQuantity Proposed write-off quantity.
 * @returns Projected remaining quantity (clamped at 0) and whether proposal exceeds stock.
 */
export function calculateRemainingAfterWaste(
  availableQuantity: number,
  discardedQuantity: number,
): {
  readonly remainingQuantity: number;
  readonly exceedsAvailable: boolean;
} {
  return {
    remainingQuantity: Math.max(0, availableQuantity - discardedQuantity),
    exceedsAvailable: discardedQuantity > availableQuantity,
  };
}

const WASTE_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
});

/**
 * Formats an ISO timestamp for backoffice waste review tables and detail dialogs.
 *
 * @param iso ISO-8601 date-time string or `null`.
 * @returns Localized `vi-VN` date-time string, or `"—"` when absent/invalid.
 */
export function formatWasteTimestamp(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return WASTE_TIMESTAMP_FORMATTER.format(date);
}

import {
  BUSINESS_RULES,
  ComplaintCategory,
  ComplaintRefundChannel,
  ComplaintResolution,
  ComplaintStatus,
  OrderStatus,
} from "@greenroots/shared";
import type { ComplaintDto } from "../schemas/complaint.schema";

export const COMPLAINT_WINDOW_MS =
  BUSINESS_RULES.COMPLAINT_WINDOW_HOURS * 3_600_000;

export const COMPLAINT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const COMPLAINT_VIDEO_MAX_BYTES = 15 * 1024 * 1024;

export const ALLOWED_COMPLAINT_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const ALLOWED_COMPLAINT_VIDEO_MIMES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

export const COMPLAINT_CATEGORY_OPTIONS: readonly {
  readonly value: ComplaintCategory;
  readonly label: string;
}[] = [
  {
    value: ComplaintCategory.DAMAGED_WILTED,
    label: "Sản phẩm dập nát / héo úa",
  },
  {
    value: ComplaintCategory.MISSING_ITEM,
    label: "Giao thiếu sản phẩm",
  },
  {
    value: ComplaintCategory.WRONG_ITEM,
    label: "Giao nhầm sản phẩm",
  },
  {
    value: ComplaintCategory.NOT_FRESH,
    label: "Không đạt độ tươi cam kết",
  },
  {
    value: ComplaintCategory.OTHER,
    label: "Khác",
  },
];

export const COMPLAINT_CATEGORY_LABELS: Record<ComplaintCategory, string> = {
  [ComplaintCategory.DAMAGED_WILTED]: "Sản phẩm dập nát / héo úa",
  [ComplaintCategory.MISSING_ITEM]: "Giao thiếu sản phẩm",
  [ComplaintCategory.WRONG_ITEM]: "Giao nhầm sản phẩm",
  [ComplaintCategory.NOT_FRESH]: "Không đạt độ tươi cam kết",
  [ComplaintCategory.OTHER]: "Khác",
};

export const COMPLAINT_STATUS_LABELS: Record<ComplaintStatus, string> = {
  [ComplaintStatus.PENDING]: "Đã tiếp nhận",
  [ComplaintStatus.TRIAGED]: "Đang kiểm tra & xử lý",
  [ComplaintStatus.APPROVED]: "Đã phê duyệt xử lý",
  [ComplaintStatus.REJECTED]: "Từ chối khiếu nại",
};

export const COMPLAINT_RESOLUTION_LABELS: Record<ComplaintResolution, string> =
  {
    [ComplaintResolution.REFUND]: "Hoàn tiền",
    [ComplaintResolution.REPLACEMENT]: "Giao bù sản phẩm",
  };

export const COMPLAINT_REFUND_CHANNEL_LABELS: Record<
  ComplaintRefundChannel,
  string
> = {
  [ComplaintRefundChannel.BANK_TRANSFER]: "Chuyển khoản ngân hàng",
  [ComplaintRefundChannel.LOYALTY_POINTS]: "Cộng điểm thành viên",
};

export interface ComplaintFsmStep {
  readonly key: "received" | "triaged" | "resolved";
  readonly label: string;
  readonly state: "completed" | "current" | "upcoming" | "rejected";
  readonly detail?: string;
}

export function isOrderComplaintEligibleStatus(
  orderStatus: OrderStatus,
): boolean {
  return (
    orderStatus === OrderStatus.DELIVERED ||
    orderStatus === OrderStatus.COMPLETED
  );
}

export function getComplaintDeadlineMs(
  deliveredAt: string | null,
): number | null {
  if (!deliveredAt) {
    return null;
  }
  const parsed = Date.parse(deliveredAt);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return parsed + COMPLAINT_WINDOW_MS;
}

export function isComplaintWindowExpired(
  deliveredAt: string | null,
  nowMs: number,
): boolean {
  const deadlineMs = getComplaintDeadlineMs(deliveredAt);
  if (deadlineMs === null) {
    return true;
  }
  return nowMs > deadlineMs;
}

export function formatRemainingCountdown(remainingMs: number): string {
  const safeSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

export function validateComplaintImageFile(file: {
  readonly size: number;
  readonly type: string;
}): string | null {
  if (
    !ALLOWED_COMPLAINT_IMAGE_MIMES.includes(
      file.type as (typeof ALLOWED_COMPLAINT_IMAGE_MIMES)[number],
    )
  ) {
    return "Chỉ hỗ trợ ảnh định dạng JPG, PNG hoặc WebP.";
  }
  if (file.size <= 0 || file.size > COMPLAINT_IMAGE_MAX_BYTES) {
    return "Mỗi ảnh phải có dung lượng tối đa 5MB.";
  }
  return null;
}

export function validateComplaintVideoMetadata(file: {
  readonly size: number;
  readonly type: string;
  readonly durationSeconds?: number | null;
}): string | null {
  if (
    !ALLOWED_COMPLAINT_VIDEO_MIMES.includes(
      file.type as (typeof ALLOWED_COMPLAINT_VIDEO_MIMES)[number],
    )
  ) {
    return "Chỉ hỗ trợ video định dạng MP4, MOV hoặc WebM.";
  }
  if (file.size <= 0 || file.size > COMPLAINT_VIDEO_MAX_BYTES) {
    return "Video vượt quá dung lượng tối đa 15MB.";
  }
  if (
    typeof file.durationSeconds === "number" &&
    Number.isFinite(file.durationSeconds) &&
    file.durationSeconds > BUSINESS_RULES.COMPLAINT_VIDEO_MAX_SECONDS
  ) {
    return `Video vượt quá thời lượng tối đa ${BUSINESS_RULES.COMPLAINT_VIDEO_MAX_SECONDS} giây.`;
  }
  return null;
}

/**
 * Derives an honest 3-step FSM timeline matching `ADR-0045` & `ADR-0046`.
 */
export function buildComplaintFsmSteps(
  complaint: ComplaintDto,
): readonly ComplaintFsmStep[] {
  const isRejected = complaint.status === ComplaintStatus.REJECTED;
  const isTriaged = complaint.status === ComplaintStatus.TRIAGED;
  const isApproved = complaint.status === ComplaintStatus.APPROVED;

  return [
    {
      key: "received",
      label: "1. Đã tiếp nhận khiếu nại",
      state: "completed",
      detail: complaint.createdAt,
    },
    {
      key: "triaged",
      label: "2. Kiểm tra hình ảnh & phân loại",
      state: isRejected
        ? "rejected"
        : isTriaged || isApproved
          ? "completed"
          : "current",
      detail: isRejected
        ? (complaint.triageNote ?? "Khiếu nại không đủ điều kiện xử lý")
        : isTriaged
          ? "Đã xác minh, chờ phương án xử lý"
          : isApproved
            ? "Đã xác minh"
            : "Đang chờ nhân viên kiểm tra",
    },
    {
      key: "resolved",
      label: "3. Kết quả xử lý",
      state: isRejected ? "rejected" : isApproved ? "completed" : "upcoming",
      detail: isApproved
        ? complaint.resolution
          ? COMPLAINT_RESOLUTION_LABELS[complaint.resolution]
          : "Đã hoàn tất"
        : isRejected
          ? "Đã đóng yêu cầu"
          : "Chờ hoàn tất",
    },
  ];
}

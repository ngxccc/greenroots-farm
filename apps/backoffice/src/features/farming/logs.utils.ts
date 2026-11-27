import { FarmingActionType, SeasonStatus } from "@greenroots/shared";
import {
  validateMediaFile,
  type MediaResourceType,
} from "@/lib/cloudinary-upload";
import type { components } from "@/types/api-schema";

export type FarmingLogDto = components["schemas"]["FarmingLogDto"];
export type CreateFarmingLogDto = components["schemas"]["CreateFarmingLogDto"];
export type SeasonDto = components["schemas"]["SeasonDto"];

export const MAX_FARMING_LOG_MEDIA = 3;
export const MAX_FARMING_LOG_DESCRIPTION_LENGTH = 2000;

export interface FarmingActionMeta {
  readonly value: FarmingActionType;
  readonly label: string;
  readonly badgeClassName: string;
}

/**
 * Ordered 2x4 quick-action metadata matching `CreateFarmingLogDto["actionType"]`.
 * The 8th action is always `correction` ("Đính chính").
 */
export const FARMING_ACTION_LIST: readonly FarmingActionMeta[] = [
  {
    value: FarmingActionType.SEEDING,
    label: "Gieo hạt",
    badgeClassName: "border-emerald-200 bg-emerald-50 text-brand-dark",
  },
  {
    value: FarmingActionType.WATERING,
    label: "Tưới nước",
    badgeClassName: "border-sky-200 bg-sky-50 text-sky-800",
  },
  {
    value: FarmingActionType.BIO_FERTILIZING,
    label: "Bón phân hữu cơ",
    badgeClassName: "border-lime-200 bg-lime-50 text-lime-800",
  },
  {
    value: FarmingActionType.WEEDING,
    label: "Làm cỏ",
    badgeClassName: "border-teal-200 bg-teal-50 text-teal-800",
  },
  {
    value: FarmingActionType.PEST_CONTROL,
    label: "Phòng trừ sâu",
    badgeClassName: "border-orange-200 bg-orange-50 text-orange-800",
  },
  {
    value: FarmingActionType.SOIL_TESTING,
    label: "Kiểm định đất",
    badgeClassName: "border-purple-200 bg-purple-50 text-purple-800",
  },
  {
    value: FarmingActionType.HARVESTING,
    label: "Thu hoạch",
    badgeClassName: "border-amber-200 bg-amber-50 text-amber-800",
  },
  {
    value: FarmingActionType.CORRECTION,
    label: "Đính chính",
    badgeClassName: "border-rose-200 bg-rose-50 text-rose-800",
  },
];

export const FARMING_ACTION_MAP: Record<FarmingActionType, FarmingActionMeta> =
  FARMING_ACTION_LIST.reduce(
    (acc, item) => {
      acc[item.value] = item;
      return acc;
    },
    {} as Record<FarmingActionType, FarmingActionMeta>,
  );

const ALL_ACTIONS = FARMING_ACTION_LIST.map((item) => item.value);

const ALLOWED_ACTIONS_BY_SEASON_STATUS: Record<
  SeasonStatus,
  readonly FarmingActionType[]
> = {
  [SeasonStatus.PLANNING]: [
    FarmingActionType.SOIL_TESTING,
    FarmingActionType.CORRECTION,
  ],
  [SeasonStatus.ACTIVE]: ALL_ACTIONS,
  [SeasonStatus.HARVESTED]: ALL_ACTIONS,
  [SeasonStatus.COMPLETED]: [FarmingActionType.CORRECTION],
};

export const SEASON_STATUS_LABELS: Record<SeasonStatus, string> = {
  [SeasonStatus.PLANNING]: "Lập kế hoạch",
  [SeasonStatus.ACTIVE]: "Đang canh tác",
  [SeasonStatus.HARVESTED]: "Đã thu hoạch",
  [SeasonStatus.COMPLETED]: "Hoàn tất",
};

export interface PendingMediaAttachment {
  readonly id: string;
  readonly file: File;
  readonly previewUrl: string;
  readonly resourceType: MediaResourceType;
}

/**
 * Checks whether a farming action can be recorded for a given season status.
 * Mirrors backend `SEASON_ALLOWED_FARMING_ACTIONS`.
 *
 * @param status Current status of the selected season.
 * @param actionType Candidate farming action type.
 * @returns True when the backend permits appending this action in the season's state.
 */
export function isActionAllowedForSeasonStatus(
  status: SeasonStatus,
  actionType: FarmingActionType,
): boolean {
  return ALLOWED_ACTIONS_BY_SEASON_STATUS[status].includes(actionType);
}

/**
 * Picks the best default season ID from a fetched list, preferring `active`
 * seasons, then `harvested`, `planning`, and finally `completed`.
 *
 * @param seasons Available seasons from `/api/v1/seasons`.
 * @returns Selected season ID or empty string when none exist.
 */
export function pickDefaultSeasonId(
  seasons: readonly Pick<SeasonDto, "id" | "status">[],
): string {
  const priority: readonly SeasonStatus[] = [
    SeasonStatus.ACTIVE,
    SeasonStatus.HARVESTED,
    SeasonStatus.PLANNING,
    SeasonStatus.COMPLETED,
  ];
  for (const status of priority) {
    const match = seasons.find((season) => season.status === status);
    if (match) return match.id;
  }
  return seasons[0]?.id ?? "";
}

/**
 * Validates the farming log description against backend length bounds.
 *
 * @param description Raw description text from the operator.
 * @returns Localized Vietnamese error message, or `null` when valid.
 */
export function validateFarmingLogDescription(
  description: string,
): string | null {
  const trimmed = description.trim();
  if (!trimmed) {
    return "Vui lòng nhập mô tả chi tiết trước khi lưu nhật ký.";
  }
  if (trimmed.length > MAX_FARMING_LOG_DESCRIPTION_LENGTH) {
    return `Mô tả không được vượt quá ${MAX_FARMING_LOG_DESCRIPTION_LENGTH} ký tự.`;
  }
  return null;
}

/**
 * Infers the Cloudinary resource type (`image` or `video`) from a file's MIME type.
 *
 * @param mimeType Browser `File.type` string.
 * @returns `"video"` for `video/*` MIME types, otherwise `"image"`.
 */
export function resolveMediaResourceType(mimeType: string): MediaResourceType {
  return mimeType.startsWith("video/") ? "video" : "image";
}

/**
 * Validates newly selected media files against the 3-attachment ceiling and
 * Cloudinary MIME/size boundaries.
 *
 * @param files Newly picked browser files.
 * @param existingCount Number of attachments already queued.
 * @returns Localized Vietnamese error message, or `null` when all files are valid.
 */
export function validateMediaSelection(
  files: readonly Pick<File, "size" | "type">[],
  existingCount: number,
): string | null {
  if (existingCount + files.length > MAX_FARMING_LOG_MEDIA) {
    return `Chỉ được đính kèm tối đa ${MAX_FARMING_LOG_MEDIA} ảnh hoặc video cho mỗi nhật ký.`;
  }
  for (const file of files) {
    const resourceType = resolveMediaResourceType(file.type);
    const fileError = validateMediaFile(file, resourceType);
    if (fileError) {
      return fileError;
    }
  }
  return null;
}

/**
 * Builds a validated `CreateFarmingLogDto` payload for a standard farming log entry.
 *
 * @param params Action type, description, and optional uploaded Cloudinary URLs.
 * @returns Payload matching `CreateFarmingLogDto`.
 */
export function buildCreateFarmingLogPayload(params: {
  readonly actionType: FarmingActionType;
  readonly description: string;
  readonly mediaUrls?: readonly string[];
}): CreateFarmingLogDto {
  const description = params.description.trim();
  const mediaUrls = params.mediaUrls?.filter((url) => url.trim().length > 0);
  return {
    actionType: params.actionType,
    description,
    ...(mediaUrls && mediaUrls.length > 0 ? { mediaUrls } : {}),
  };
}

/**
 * Builds a validated `CreateFarmingLogDto` payload for an append-only correction record.
 * Always sets `actionType` to `"correction"` and links `correctsLogId`.
 *
 * @param params Target log ID in the same season, correction note, and optional media URLs.
 * @returns Payload matching `CreateFarmingLogDto`.
 */
export function buildCorrectionLogPayload(params: {
  readonly correctsLogId: string;
  readonly description: string;
  readonly mediaUrls?: readonly string[];
}): CreateFarmingLogDto {
  const description = params.description.trim();
  const mediaUrls = params.mediaUrls?.filter((url) => url.trim().length > 0);
  return {
    actionType: FarmingActionType.CORRECTION,
    correctsLogId: params.correctsLogId,
    description,
    ...(mediaUrls && mediaUrls.length > 0 ? { mediaUrls } : {}),
  };
}

/**
 * Formats an ISO timestamp for display in the farming log timeline (`HH:mm · dd/MM/yyyy`).
 *
 * @param isoDate ISO 8601 date-time string from the API.
 * @returns Formatted Vietnamese timestamp string.
 */
export function formatLogTimestamp(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  const timePart = new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  const datePart = new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
  return `${timePart} · ${datePart}`;
}

/**
 * Checks whether a Cloudinary media URL points to a video asset.
 *
 * @param url Uploaded Cloudinary URL.
 * @returns True when the URL path indicates a video resource.
 */
export function isVideoMediaUrl(url: string): boolean {
  return (
    url.includes("/video/upload/") || /\.(mp4|mov|webm)(?:\?.*)?$/i.test(url)
  );
}

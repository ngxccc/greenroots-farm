import { SeasonStatus, type UserRole } from "@greenroots/shared";
import type { components } from "@/types/api-schema";

export type PlotDto = components["schemas"]["PlotDto"];
export type CreatePlotDto = components["schemas"]["CreatePlotDto"];
export type UpdatePlotDto = components["schemas"]["UpdatePlotDto"];
export type SeasonDto = components["schemas"]["SeasonDto"];
export type CreateSeasonDto = components["schemas"]["CreateSeasonDto"];
export type UpdateSeasonDto = components["schemas"]["UpdateSeasonDto"];
export type SoilTestResult = NonNullable<PlotDto["soilTestResult"]>;
export type WaterTestResult = NonNullable<PlotDto["waterTestResult"]>;

const LINEAR_SEASON_TRANSITIONS: Record<SeasonStatus, SeasonStatus | null> = {
  [SeasonStatus.PLANNING]: SeasonStatus.ACTIVE,
  [SeasonStatus.ACTIVE]: SeasonStatus.HARVESTED,
  [SeasonStatus.HARVESTED]: SeasonStatus.COMPLETED,
  [SeasonStatus.COMPLETED]: null,
};

export interface SeasonStatusMeta {
  readonly label: string;
  readonly nextActionLabel: string | null;
  readonly badgeClassName: string;
}

export const SEASON_STATUS_META: Record<SeasonStatus, SeasonStatusMeta> = {
  [SeasonStatus.PLANNING]: {
    label: "Lập kế hoạch",
    nextActionLabel: "Bắt đầu canh tác",
    badgeClassName: "border-border-subtle bg-gray-100 text-gray-800",
  },
  [SeasonStatus.ACTIVE]: {
    label: "Đang canh tác",
    nextActionLabel: "Đánh dấu thu hoạch",
    badgeClassName: "border-emerald-200 bg-emerald-50 text-brand-dark",
  },
  [SeasonStatus.HARVESTED]: {
    label: "Đã thu hoạch",
    nextActionLabel: "Hoàn tất mùa vụ",
    badgeClassName: "border-amber-200 bg-amber-50 text-amber-800",
  },
  [SeasonStatus.COMPLETED]: {
    label: "Hoàn tất",
    nextActionLabel: null,
    badgeClassName: "border-border-subtle bg-gray-100 text-gray-600",
  },
};

export interface PlotDeleteGuardResult {
  readonly allowed: boolean;
  readonly reason: string | null;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly error: string | null;
}

/**
 * Checks whether the current staff role is permitted to delete plots or seasons.
 * Backend controllers restrict DELETE /plots/:id and DELETE /seasons/:id to admin and super_admin.
 *
 * @param role Active staff role from the auth store.
 * @returns True when the role can perform delete actions.
 */
export function canDeletePlotOrSeason(role: UserRole | undefined): boolean {
  return role === "admin" || role === "super_admin";
}

/**
 * Resolves the next linear lifecycle status for a cultivation season.
 *
 * @param current Current season status.
 * @returns Next valid status in the linear lifecycle, or null when already completed.
 */
export function getNextSeasonStatus(
  current: SeasonStatus,
): SeasonStatus | null {
  return LINEAR_SEASON_TRANSITIONS[current] ?? null;
}

/**
 * Validates whether a season can transition directly from `from` to `to`.
 *
 * @param from Current season status.
 * @param to Target season status.
 * @returns True only for the immediate next step in planning -> active -> harvested -> completed.
 */
export function canTransitionSeasonStatus(
  from: SeasonStatus,
  to: SeasonStatus,
): boolean {
  return getNextSeasonStatus(from) === to;
}

/**
 * Determines whether a cultivation plot can be soft-deleted based on its linked seasons.
 * Mirrors backend guard: plots with planning or active seasons cannot be deleted.
 *
 * @param plotId Target plot ID.
 * @param seasons Known cultivation seasons.
 * @returns Guard decision with a Vietnamese explanation when blocked.
 */
export function canDeletePlot(
  plotId: string,
  seasons: readonly Pick<SeasonDto, "plotId" | "status" | "seasonName">[],
): PlotDeleteGuardResult {
  const blockingSeason = seasons.find(
    (season) =>
      season.plotId === plotId &&
      (season.status === SeasonStatus.ACTIVE ||
        season.status === SeasonStatus.PLANNING),
  );

  if (blockingSeason) {
    return {
      allowed: false,
      reason: `Không thể xóa lô đất vì đang có mùa vụ "${blockingSeason.seasonName}" (${SEASON_STATUS_META[blockingSeason.status].label}).`,
    };
  }

  return { allowed: true, reason: null };
}

/**
 * Determines whether a season can be hard-deleted.
 * Backend only permits deleting seasons still in `planning` status.
 *
 * @param season Target season.
 * @returns True when the season is in `planning` status.
 */
export function canDeleteSeason(season: Pick<SeasonDto, "status">): boolean {
  return season.status === SeasonStatus.PLANNING;
}

/**
 * Returns the primary ongoing season for a plot, preferring `active` over `planning`.
 *
 * @param plotId Target plot ID.
 * @param seasons List of cultivation seasons.
 * @returns Matching active or planning season, or null if none exists.
 */
export function getActiveSeasonForPlot(
  plotId: string,
  seasons: readonly SeasonDto[],
): SeasonDto | null {
  const plotSeasons = seasons.filter((season) => season.plotId === plotId);
  return (
    plotSeasons.find((season) => season.status === SeasonStatus.ACTIVE) ??
    plotSeasons.find((season) => season.status === SeasonStatus.PLANNING) ??
    null
  );
}

/**
 * Validates plot creation/update form fields before submitting to the API.
 *
 * @param input Plot form fields.
 * @returns Validation status with a Vietnamese error message when invalid.
 */
export function validatePlotInput(input: {
  readonly plotCode: string;
  readonly name: string;
  readonly areaSqm: number;
}): ValidationResult {
  if (!input.plotCode.trim()) {
    return { valid: false, error: "Vui lòng nhập mã lô đất." };
  }
  if (!input.name.trim()) {
    return { valid: false, error: "Vui lòng nhập tên lô đất." };
  }
  if (!Number.isFinite(input.areaSqm) || input.areaSqm <= 0) {
    return { valid: false, error: "Diện tích (m²) phải lớn hơn 0." };
  }
  return { valid: true, error: null };
}

/**
 * Validates season creation/update form fields before submitting to the API.
 *
 * @param input Season form fields.
 * @returns Validation status with a Vietnamese error message when invalid.
 */
export function validateSeasonInput(input: {
  readonly plotId: string;
  readonly seasonName: string;
  readonly startDate: string;
  readonly expectedHarvestDate: string;
}): ValidationResult {
  if (!input.plotId.trim()) {
    return { valid: false, error: "Vui lòng chọn lô đất cho mùa vụ." };
  }
  if (!input.seasonName.trim()) {
    return { valid: false, error: "Vui lòng nhập tên mùa vụ." };
  }
  if (!input.startDate || !input.expectedHarvestDate) {
    return {
      valid: false,
      error: "Vui lòng chọn ngày bắt đầu và ngày dự kiến thu hoạch.",
    };
  }
  if (input.startDate > input.expectedHarvestDate) {
    return {
      valid: false,
      error: "Ngày dự kiến thu hoạch phải sau hoặc bằng ngày bắt đầu.",
    };
  }
  return { valid: true, error: null };
}

/**
 * Formats an ISO date string (`YYYY-MM-DD` or ISO timestamp) into `DD/MM/YYYY` for Vietnamese UI.
 *
 * @param isoDate Date string from the API.
 * @returns Formatted date string, or the original value if unparseable.
 */
export function formatDisplayDate(isoDate: string): string {
  const datePart = isoDate.slice(0, 10);
  const parts = datePart.split("-");
  if (parts.length !== 3) {
    return isoDate;
  }
  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

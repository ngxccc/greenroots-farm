import type { FarmingActionType } from "@greenroots/shared";
import { api, extractApiErrorMessage } from "@/lib/api-client";
import type { components } from "@/types/api-schema";
import type {
  CreateFarmingLogDto,
  FarmingLogDto,
  SeasonDto,
} from "./logs.utils";

export type PaginationMetaDto = components["schemas"]["PaginationMetaDto"];

export interface SeasonLogsResponse {
  readonly items: FarmingLogDto[];
  readonly meta: PaginationMetaDto;
}

export interface FetchSeasonLogsParams {
  readonly actionType?: FarmingActionType;
  readonly page?: number;
  readonly limit?: number;
  readonly sort?: "loggedAt:desc" | "loggedAt:asc";
}

/**
 * Fetches available cultivation seasons for the farming log season selector.
 */
export async function fetchAvailableSeasons(): Promise<SeasonDto[]> {
  const { data, error } = await api.GET("/api/v1/seasons", {
    params: {
      query: {
        limit: 100,
        sort: "createdAt:desc",
      },
    },
  });

  if (error) {
    throw new Error(
      extractApiErrorMessage(error, "Không thể tải danh sách mùa vụ."),
    );
  }

  return data.data;
}

/**
 * Fetches the append-only farming log timeline for a specific season.
 */
export async function fetchSeasonLogs(
  seasonId: string,
  params: FetchSeasonLogsParams = {},
): Promise<SeasonLogsResponse> {
  const { data, error } = await api.GET("/api/v1/seasons/{id}/logs", {
    params: {
      path: { id: seasonId },
      query: {
        limit: params.limit ?? 20,
        page: params.page ?? 1,
        sort: params.sort ?? "loggedAt:desc",
        ...(params.actionType ? { actionType: params.actionType } : {}),
      },
    },
  });

  if (error) {
    throw new Error(
      extractApiErrorMessage(error, "Không thể tải nhật ký canh tác."),
    );
  }

  return {
    items: data.data,
    meta: data.meta,
  };
}

/**
 * Appends an immutable farming log or correction record to a season with an `Idempotency-Key`.
 */
export async function createSeasonLog(
  seasonId: string,
  body: CreateFarmingLogDto,
  idempotencyKey: string,
): Promise<FarmingLogDto> {
  const { data, error } = await api.POST("/api/v1/seasons/{id}/logs", {
    params: {
      path: { id: seasonId },
      header: {
        "Idempotency-Key": idempotencyKey,
      },
    },
    body,
  });

  if (error) {
    throw new Error(
      extractApiErrorMessage(error, "Không thể lưu nhật ký canh tác."),
    );
  }

  return data.data;
}

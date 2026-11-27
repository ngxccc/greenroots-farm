import { api, extractApiErrorMessage } from "@/lib/api-client";
import type {
  CreatePlotDto,
  CreateSeasonDto,
  PlotDto,
  SeasonDto,
  UpdatePlotDto,
  UpdateSeasonDto,
} from "./plots-seasons.utils";

/**
 * Fetches all active cultivation plots from the backoffice API.
 */
export async function fetchPlots(q?: string): Promise<PlotDto[]> {
  const { data, error } = await api.GET("/api/v1/plots", {
    params: {
      query: {
        limit: 100,
        sort: "plotCode:asc",
        ...(q?.trim() ? { q: q.trim() } : {}),
      },
    },
  });

  if (error) {
    throw new Error(
      extractApiErrorMessage(error, "Không thể tải danh sách lô đất."),
    );
  }

  return data.data;
}

/**
 * Creates a new cultivation plot.
 */
export async function createPlot(body: CreatePlotDto): Promise<PlotDto> {
  const { data, error } = await api.POST("/api/v1/plots", { body });
  if (error) {
    throw new Error(extractApiErrorMessage(error, "Không thể tạo lô đất mới."));
  }
  return data.data;
}

/**
 * Updates an existing cultivation plot or its soil/water test telemetry.
 */
export async function updatePlot(
  id: string,
  body: UpdatePlotDto,
): Promise<PlotDto> {
  const { data, error } = await api.PATCH("/api/v1/plots/{id}", {
    params: { path: { id } },
    body,
  });
  if (error) {
    throw new Error(
      extractApiErrorMessage(error, "Không thể cập nhật thông tin lô đất."),
    );
  }
  return data.data;
}

/**
 * Soft-deletes a cultivation plot when no planning or active season references it.
 */
export async function deletePlot(id: string): Promise<void> {
  const { error } = await api.DELETE("/api/v1/plots/{id}", {
    params: { path: { id } },
  });
  if (error) {
    throw new Error(extractApiErrorMessage(error, "Không thể xóa lô đất."));
  }
}

/**
 * Fetches cultivation seasons from the backoffice API.
 */
export async function fetchSeasons(): Promise<SeasonDto[]> {
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
 * Creates a new cultivation season in `planning` status.
 */
export async function createSeason(body: CreateSeasonDto): Promise<SeasonDto> {
  const { data, error } = await api.POST("/api/v1/seasons", { body });
  if (error) {
    throw new Error(extractApiErrorMessage(error, "Không thể tạo mùa vụ mới."));
  }
  return data.data;
}

/**
 * Updates season metadata or advances its lifecycle status.
 */
export async function updateSeason(
  id: string,
  body: UpdateSeasonDto,
): Promise<SeasonDto> {
  const { data, error } = await api.PATCH("/api/v1/seasons/{id}", {
    params: { path: { id } },
    body,
  });
  if (error) {
    throw new Error(
      extractApiErrorMessage(error, "Không thể cập nhật mùa vụ."),
    );
  }
  return data.data;
}

/**
 * Hard-deletes a `planning` cultivation season.
 */
export async function deleteSeason(id: string): Promise<void> {
  const { error } = await api.DELETE("/api/v1/seasons/{id}", {
    params: { path: { id } },
  });
  if (error) {
    throw new Error(extractApiErrorMessage(error, "Không thể xóa mùa vụ."));
  }
}

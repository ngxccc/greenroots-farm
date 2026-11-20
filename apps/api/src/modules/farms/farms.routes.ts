/**
 * Centralized route and Swagger tag constants for the Farms Module.
 * Conforms to docs/standards/api-design-and-error-handling.md §8.
 */
export const FARMS_ROUTES = Object.freeze({
  TAG: "farms",
  SETTINGS_BASE: "farms/settings",
  PLOTS_BASE: "plots",
  PLOT_BY_ID: ":id",
  SEASONS_BASE: "seasons",
  SEASON_BY_ID: ":id",
  SEASON_LOGS_BASE: "seasons/:id/logs",
  TRACE_BASE: "trace",
  TRACE_BY_BATCH_CODE: ":batchCode",
} as const);

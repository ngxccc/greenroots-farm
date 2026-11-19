/**
 * Centralized route and Swagger tag constants for the Farms Module.
 * Conforms to docs/standards/api-design-and-error-handling.md §8.
 */
export const FARMS_ROUTES = Object.freeze({
  TAG: "farms",
  SETTINGS_BASE: "farms/settings",
  PLOTS_BASE: "plots",
  PLOT_BY_ID: ":id",
} as const);

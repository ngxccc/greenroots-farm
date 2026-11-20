/**
 * Centralized route and Swagger tag constants for the Inventory Module.
 * Conforms to docs/standards/api-design-and-error-handling.md §8.
 */
export const INVENTORY_ROUTES = Object.freeze({
  TAG: "inventory",
  BATCHES_BASE: "batches",
  BATCH_BY_ID: ":id",
} as const);

/**
 * Centralized route and Swagger tag constants for the Inventory Module.
 * Conforms to docs/standards/api-design-and-error-handling.md §8.
 */
export const INVENTORY_ROUTES = Object.freeze({
  TAG: "inventory",
  INVENTORY_BASE: "inventory",
  INVENTORY_NEAR_EXPIRY: "near-expiry",
  BATCHES_BASE: "batches",
  BATCH_BY_ID: ":id",
  BATCH_QR_LABEL: ":id/qr-label",
  BATCH_FLASH_SALE: ":id/flash-sale",
  WASTE_LOGS_BASE: "waste-logs",
  WASTE_LOG_BY_ID: ":id",
  WASTE_LOG_APPROVE: ":id/approve",
  WASTE_LOG_REJECT: ":id/reject",
} as const);

/**
 * Centralized route and Swagger tag constants for the Complaints module.
 */
export const COMPLAINTS_ROUTES = Object.freeze({
  TAG: "complaints",
  BASE: "complaints",
  TRIAGE: ":id/triage",
  ORDERS_BASE: "orders",
  SUBMIT: ":id/complaints",
} as const);

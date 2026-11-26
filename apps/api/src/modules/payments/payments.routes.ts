/**
 * Route metadata and path constants for `PaymentsController`.
 */
export const PAYMENTS_ROUTES = {
  TAG: "Payments",
  BASE: "payments",
  PAYOS_WEBHOOK: "payos/webhook",
  CONFIRM_COD: ":id/confirm-cod",
} as const;

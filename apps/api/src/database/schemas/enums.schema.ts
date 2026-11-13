import { pgEnum } from "drizzle-orm/pg-core";
import {
  BatchStatus,
  ComplaintResolution,
  ComplaintStatus,
  DeliveryDay,
  FarmingActionType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
  SeasonStatus,
  SubscriptionStatus,
  UserRole,
  UserStatus,
  WasteLogStatus,
} from "@greenroots/shared";

/**
 * Converts a shared SSOT enum object into a non-empty tuple accepted by pgEnum.
 * Values are reused verbatim from `@greenroots/shared`; no duplication.
 */
function enumValues<T extends Record<string, string>>(
  source: T,
): [T[keyof T], ...T[keyof T][]] {
  return Object.values(source) as [T[keyof T], ...T[keyof T][]];
}

export const userRoleEnum = pgEnum("user_role", enumValues(UserRole));
export const userStatusEnum = pgEnum("user_status", enumValues(UserStatus));
export const seasonStatusEnum = pgEnum(
  "season_status",
  enumValues(SeasonStatus),
);
export const farmingActionTypeEnum = pgEnum(
  "farming_action_type",
  enumValues(FarmingActionType),
);
export const batchStatusEnum = pgEnum("batch_status", enumValues(BatchStatus));
export const orderStatusEnum = pgEnum("order_status", enumValues(OrderStatus));
export const paymentMethodEnum = pgEnum(
  "payment_method",
  enumValues(PaymentMethod),
);
export const paymentStatusEnum = pgEnum(
  "payment_status",
  enumValues(PaymentStatus),
);
export const paymentTransactionTypeEnum = pgEnum(
  "payment_transaction_type",
  enumValues(PaymentTransactionType),
);
export const deliveryDayEnum = pgEnum("delivery_day", enumValues(DeliveryDay));
export const subscriptionStatusEnum = pgEnum(
  "subscription_status",
  enumValues(SubscriptionStatus),
);
export const complaintStatusEnum = pgEnum(
  "complaint_status",
  enumValues(ComplaintStatus),
);
export const complaintResolutionEnum = pgEnum(
  "complaint_resolution",
  enumValues(ComplaintResolution),
);
export const wasteLogStatusEnum = pgEnum(
  "waste_log_status",
  enumValues(WasteLogStatus),
);

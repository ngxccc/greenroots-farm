import { z } from "zod";
import { MESSAGES } from "@/common/constants/messages.constant";
import { BATCH_MAX_QUANTITY, BATCH_MIN_QUANTITY } from "../inventory.interface";

/**
 * Builds a bounded positive inventory quantity schema enforcing `numeric(10, 2)` precision.
 */
export function zInventoryQuantity() {
  return z
    .number()
    .min(BATCH_MIN_QUANTITY, { message: MESSAGES.VALIDATION.MIN_VALUE })
    .max(BATCH_MAX_QUANTITY, { message: MESSAGES.VALIDATION.MAX_VALUE })
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
      message: MESSAGES.VALIDATION.INVALID_QUANTITY_PRECISION,
    });
}

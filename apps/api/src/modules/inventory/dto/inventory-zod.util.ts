import { zDecimalQuantity } from "@/common/schemas/zod-primitives";
import { BATCH_MAX_QUANTITY, BATCH_MIN_QUANTITY } from "../inventory.interface";

/**
 * Builds a bounded positive inventory quantity schema enforcing `numeric(10, 2)` precision.
 */
export function zInventoryQuantity() {
  return zDecimalQuantity({ min: BATCH_MIN_QUANTITY, max: BATCH_MAX_QUANTITY });
}

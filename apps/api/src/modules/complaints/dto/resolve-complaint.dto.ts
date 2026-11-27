import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import {
  ComplaintRefundChannel,
  ComplaintResolution,
} from "@greenroots/shared";
import { MESSAGES } from "@/common/constants/messages.constant";
import { zSanitizedString, zUuidV7 } from "@/common/schemas/zod-primitives";
import {
  MAX_CART_LINE_ITEMS,
  ORDER_ITEM_MAX_QUANTITY,
} from "@/modules/orders/orders.constant";
import {
  REFUND_REFERENCE_CODE_MAX_LENGTH,
  RESOLUTION_NOTE_MAX_LENGTH,
} from "../complaints.constant";

/**
 * Zod schema for a single replacement line item (`ADR-0046`).
 */
export const resolveReplacementItemSchema = z
  .object({
    productId: zUuidV7().describe("Product UUIDv7 from the original order"),
    quantity: z
      .number()
      .positive()
      .max(ORDER_ITEM_MAX_QUANTITY)
      .refine((value) => Math.round(value * 100) === value * 100, {
        message: MESSAGES.VALIDATION.INVALID_QUANTITY_PRECISION,
      })
      .describe(
        "Replacement quantity (up to 2 decimal places, <= original item quantity)",
      ),
  })
  .strict();

/**
 * Zod schema for Admin complaint resolution (`POST /api/v1/complaints/:id/resolve`, `ADR-0046`).
 * Supports dual-channel refunds (`bank_transfer` or `loyalty_points`) and `0đ` FEFO replacements.
 */
export const resolveComplaintSchema = z
  .object({
    resolution: z
      .enum(ComplaintResolution)
      .describe("Resolution action (refund or replacement)"),
    refundChannel: z
      .enum(ComplaintRefundChannel)
      .optional()
      .describe(
        "Required when resolution is refund (bank_transfer or loyalty_points)",
      ),
    refundAmountVnd: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "Optional refund amount in integer VND (defaults to original order totalAmount)",
      ),
    referenceCode: zSanitizedString({ max: REFUND_REFERENCE_CODE_MAX_LENGTH })
      .nullable()
      .optional()
      .describe(
        "Optional bank-transfer reference code when refundChannel is bank_transfer",
      ),
    items: z
      .array(resolveReplacementItemSchema)
      .min(1)
      .max(MAX_CART_LINE_ITEMS)
      .optional()
      .describe(
        "Optional subset of original order items for replacement (defaults to full copy)",
      ),
    resolutionNote: zSanitizedString({ max: RESOLUTION_NOTE_MAX_LENGTH })
      .nullable()
      .optional()
      .describe("Optional administrative resolution note (<= 500 chars)"),
  })
  .strict()
  .superRefine((data, ctx) => {
    const addInvalidField = (
      path: (string | number)[],
      message: string = MESSAGES.VALIDATION.INVALID_VALUE,
    ) => {
      ctx.addIssue({ code: "custom", path, message });
    };

    const hasReferenceCode =
      data.referenceCode !== undefined &&
      data.referenceCode !== null &&
      data.referenceCode.length > 0;

    if (data.resolution === ComplaintResolution.REFUND) {
      if (!data.refundChannel) {
        addInvalidField(["refundChannel"], MESSAGES.VALIDATION.REQUIRED);
      }
      if (data.items !== undefined) {
        addInvalidField(["items"]);
      }
      if (
        data.refundChannel === ComplaintRefundChannel.LOYALTY_POINTS &&
        hasReferenceCode
      ) {
        addInvalidField(["referenceCode"]);
      }
      return;
    }

    if (data.refundChannel !== undefined) {
      addInvalidField(["refundChannel"]);
    }
    if (data.refundAmountVnd !== undefined) {
      addInvalidField(["refundAmountVnd"]);
    }
    if (hasReferenceCode) {
      addInvalidField(["referenceCode"]);
    }
    if (data.items) {
      const seen = new Set<string>();
      for (let i = 0; i < data.items.length; i += 1) {
        const item = data.items[i]!;
        if (seen.has(item.productId)) {
          addInvalidField(["items", i, "productId"]);
        }
        seen.add(item.productId);
      }
    }
  });

/** Validated Admin resolution payload consumed by `ComplaintsService`. */
export type ResolveComplaintInput = z.infer<typeof resolveComplaintSchema>;

/**
 * Request body DTO for `POST /api/v1/complaints/:id/resolve`.
 */
export class ResolveComplaintDto extends createZodDto(resolveComplaintSchema) {
  public static readonly zodSchema = resolveComplaintSchema;
}

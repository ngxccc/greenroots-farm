import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { BUSINESS_RULES, ComplaintCategory } from "@greenroots/shared";
import { MESSAGES } from "@/common/constants/messages.constant";
import {
  zCloudinaryMediaUrl,
  zSanitizedString,
  zUuidV7,
} from "@/common/schemas/zod-primitives";
import {
  COMPLAINT_MEDIA_URL_MAX_LENGTH,
  COMPLAINT_REASON_MAX_LENGTH,
  COMPLAINT_REASON_MIN_LENGTH,
} from "../complaints.constant";

/**
 * Zod schema for submitting a post-delivery customer complaint (`POST /api/v1/orders/:id/complaints`).
 */
export const createComplaintSchema = z
  .object({
    category: z
      .enum(ComplaintCategory)
      .describe("Standardized complaint category"),
    affectedOrderItemIds: z
      .array(zUuidV7())
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "Affected order item IDs must be unique",
      })
      .describe("Unique UUIDv7 IDs of affected order line items"),
    reason: zSanitizedString({
      min: COMPLAINT_REASON_MIN_LENGTH,
      max: COMPLAINT_REASON_MAX_LENGTH,
    }).describe("Customer complaint description (10-2000 characters)"),
    proofImageUrls: z
      .array(
        zCloudinaryMediaUrl({
          folder: "complaints",
          resourceTypes: ["image"],
        }).refine((url) => url.length <= COMPLAINT_MEDIA_URL_MAX_LENGTH, {
          message: MESSAGES.VALIDATION.MAX_LENGTH,
        }),
      )
      .min(BUSINESS_RULES.COMPLAINT_MIN_IMAGES)
      .max(BUSINESS_RULES.COMPLAINT_MAX_IMAGES)
      .refine((urls) => new Set(urls).size === urls.length, {
        message: MESSAGES.VALIDATION.DUPLICATE_MEDIA_URL,
      })
      .describe(
        "1 to 5 unique Cloudinary proof image URLs in complaints folder",
      ),
    proofVideoUrl: zCloudinaryMediaUrl({
      folder: "complaints",
      resourceTypes: ["video"],
    })
      .refine((url) => url.length <= COMPLAINT_MEDIA_URL_MAX_LENGTH, {
        message: MESSAGES.VALIDATION.MAX_LENGTH,
      })
      .nullable()
      .optional()
      .describe(
        "Optional Cloudinary proof video URL in complaints folder (<= 15MB, <= 15s)",
      ),
  })
  .strict();

/** Validated complaint submission payload consumed by `ComplaintsService`. */
export type CreateComplaintInput = z.infer<typeof createComplaintSchema>;

/**
 * Request body DTO for `POST /api/v1/orders/:id/complaints`.
 */
export class CreateComplaintDto extends createZodDto(createComplaintSchema) {
  public static readonly zodSchema = createComplaintSchema;
}

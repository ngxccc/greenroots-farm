import { BUSINESS_RULES, ComplaintCategory } from "@greenroots/shared";
import { z } from "zod";
import type { components } from "@/types/api-schema";

export type ComplaintDto = components["schemas"]["ComplaintDto"];
export type CreateComplaintRequest =
  components["schemas"]["CreateComplaintDto"];
export type SignedUploadResponse =
  components["schemas"]["SignedUploadResponseDto"];

export const COMPLAINT_REASON_MIN_LENGTH = 10;
export const COMPLAINT_REASON_MAX_LENGTH = 2000;

/**
 * Strict input schema for `submitComplaintAction` matching `POST /api/v1/orders/:id/complaints`.
 */
export const submitComplaintInputSchema = z
  .object({
    orderId: z.uuid("Mã đơn hàng không hợp lệ."),
    category: z.enum(ComplaintCategory),
    affectedOrderItemIds: z
      .array(z.uuid("Mã sản phẩm đơn hàng không hợp lệ."))
      .min(1, "Vui lòng chọn ít nhất 1 sản phẩm gặp sự cố.")
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Danh sách sản phẩm gặp sự cố không được trùng lặp.",
      ),
    reason: z
      .string()
      .trim()
      .min(
        COMPLAINT_REASON_MIN_LENGTH,
        `Vui lòng mô tả chi tiết tối thiểu ${COMPLAINT_REASON_MIN_LENGTH} ký tự.`,
      )
      .max(
        COMPLAINT_REASON_MAX_LENGTH,
        `Mô tả chi tiết tối đa ${COMPLAINT_REASON_MAX_LENGTH} ký tự.`,
      ),
    proofImageUrls: z
      .array(z.url("Liên kết hình ảnh không hợp lệ."))
      .min(
        BUSINESS_RULES.COMPLAINT_MIN_IMAGES,
        `Vui lòng tải lên ít nhất ${BUSINESS_RULES.COMPLAINT_MIN_IMAGES} ảnh thực tế.`,
      )
      .max(
        BUSINESS_RULES.COMPLAINT_MAX_IMAGES,
        `Tối đa ${BUSINESS_RULES.COMPLAINT_MAX_IMAGES} ảnh thực tế.`,
      )
      .refine(
        (urls) => new Set(urls).size === urls.length,
        "Danh sách hình ảnh minh chứng không được trùng lặp.",
      ),
    proofVideoUrl: z.url("Liên kết video không hợp lệ.").nullable().optional(),
  })
  .strict();

export type SubmitComplaintInput = z.input<typeof submitComplaintInputSchema>;

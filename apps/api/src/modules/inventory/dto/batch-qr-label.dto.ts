import { createZodDto } from "nestjs-zod";
import { z } from "zod";

/**
 * Zod schema for the thermal-sticker label payload returned by `GET /api/v1/batches/:id/qr-label`.
 * Excludes mutable operational fields (`status`, `availableQuantity`) so repeated calls stay deterministic.
 */
export const batchQrLabelPayloadSchema = z.object({
  batchCode: z.string(),
  productName: z.string(),
  unit: z.string(),
  harvestDate: z.iso.datetime(),
  expirationDate: z.iso.datetime(),
  qrValue: z.url(),
});

/**
 * Zod schema for the deterministic batch QR label projection (`GET /api/v1/batches/:id/qr-label`).
 */
export const batchQrLabelSchema = z.object({
  batchCode: z.string(),
  traceUrl: z.url(),
  labelPayload: batchQrLabelPayloadSchema,
});

/** Thermal-sticker label payload shape consumed by backoffice print layouts. */
export type BatchQrLabelPayload = z.infer<typeof batchQrLabelPayloadSchema>;

/** Deterministic QR label projection returned by `BatchesService.getBatchQrLabel`. */
export type BatchQrLabelProjection = z.infer<typeof batchQrLabelSchema>;

/**
 * Response DTO for `GET /api/v1/batches/:id/qr-label`.
 */
export class BatchQrLabelDto extends createZodDto(batchQrLabelSchema) {
  public static readonly zodSchema = batchQrLabelSchema;
}

import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { zUuidV7 } from "@/common/schemas/zod-primitives";

/**
 * Zod schema for farm hotline contact channels.
 */
export const farmHotlinesSchema = z.object({
  primary: z.string(),
  support: z.string().optional(),
});

/**
 * Zod schema for farm email contact channels.
 */
export const farmEmailsSchema = z.object({
  primary: z.string(),
  support: z.string().optional(),
});

/**
 * Zod schema for farm operating hours.
 */
export const farmWorkingHoursSchema = z.object({
  weekdays: z.string(),
  weekend: z.string(),
});

/**
 * Zod schema for farm settlement bank account details.
 */
export const farmBankInfoSchema = z.object({
  bankName: z.string(),
  accountNumber: z.string(),
  accountHolder: z.string(),
});

/**
 * Zod schema for dynamic farm shipping configuration.
 */
export const farmShippingConfigSchema = z.object({
  baseFeeVnd: z.number().int(),
  freeKmThreshold: z.number(),
  perKmRateVnd: z.number().int(),
  detourFactor: z.number(),
  maxRadiusKm: z.number().positive(),
  subscriptionFreeRadiusKm: z.number().positive(),
});

/**
 * Zod schema for automated flash-sale discount rules.
 */
export const farmFlashSaleConfigSchema = z.object({
  hoursThreshold: z.number().int(),
  discountPercent: z.number().int(),
});

/**
 * Zod schema for the singleton farm settings response payload.
 */
export const farmSettingsSchema = z.object({
  id: zUuidV7(),
  name: z.string(),
  legalName: z.string(),
  tagline: z.string().nullable(),
  taxId: z.string().nullable(),
  address: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  certificationUrl: z.string().nullable(),
  hotlines: farmHotlinesSchema,
  emails: farmEmailsSchema,
  workingHours: farmWorkingHoursSchema,
  bankInfo: farmBankInfoSchema.nullable(),
  shippingConfig: farmShippingConfigSchema,
  flashSaleConfig: farmFlashSaleConfigSchema,
  isPayosEnabled: z.boolean(),
  isCodEnabled: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/**
 * Serialized singleton farm settings projection returned by `/api/v1/farms/settings`.
 */
export type FarmSettings = z.infer<typeof farmSettingsSchema>;

/**
 * Response DTO for the singleton farm settings resource (`/api/v1/farms/settings`).
 */
export class FarmSettingsDto extends createZodDto(farmSettingsSchema) {
  public static readonly zodSchema = farmSettingsSchema;
}

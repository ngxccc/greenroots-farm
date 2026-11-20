import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { MESSAGES } from "@/common/constants/messages.constant";
import {
  zCloudinaryMediaUrl,
  zEmail,
  zOptionalTaxId,
  zSanitizedString,
} from "@/common/schemas/zod-primitives";

const updateFarmHotlinesSchema = z
  .object({
    primary: zSanitizedString({ min: 1, max: 30 }),
    support: zSanitizedString({ min: 1, max: 30 }).optional(),
  })
  .strict();

const updateFarmEmailsSchema = z
  .object({
    primary: zEmail(),
    support: zEmail().optional(),
  })
  .strict();

const updateFarmWorkingHoursSchema = z
  .object({
    weekdays: zSanitizedString({ min: 1, max: 100 }),
    weekend: zSanitizedString({ min: 1, max: 100 }),
  })
  .strict();

const updateFarmBankInfoSchema = z
  .object({
    bankName: zSanitizedString({ min: 1, max: 100 }),
    accountNumber: zSanitizedString({ min: 1, max: 50 }),
    accountHolder: zSanitizedString({ min: 1, max: 150 }),
  })
  .strict();

const updateFarmShippingConfigSchema = z
  .object({
    baseFeeVnd: z.number().int().min(0),
    freeKmThreshold: z.number().min(0),
    perKmRateVnd: z.number().int().min(0),
    detourFactor: z.number().min(1),
    maxRadiusKm: z.number().positive().optional(),
    subscriptionFreeRadiusKm: z.number().positive().optional(),
  })
  .strict();

const updateFarmFlashSaleConfigSchema = z
  .object({
    hoursThreshold: z.number().int().min(1).max(168),
    discountPercent: z.number().int().min(1).max(99),
  })
  .strict();

/**
 * Zod schema for partial updates to the singleton farm settings (`PATCH /api/v1/farms/settings`).
 */
export const updateFarmSettingsSchema = z
  .object({
    name: zSanitizedString({ min: 1, max: 255 }).optional(),
    legalName: zSanitizedString({ min: 1, max: 255 }).optional(),
    tagline: zSanitizedString({ min: 1, max: 255 }).nullable().optional(),
    taxId: zOptionalTaxId(),
    address: zSanitizedString({ min: 1, max: 500 }).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    certificationUrl: zCloudinaryMediaUrl({ resourceTypes: ["image"] })
      .nullable()
      .optional(),
    hotlines: updateFarmHotlinesSchema.optional(),
    emails: updateFarmEmailsSchema.optional(),
    workingHours: updateFarmWorkingHoursSchema.optional(),
    bankInfo: updateFarmBankInfoSchema.nullable().optional(),
    shippingConfig: updateFarmShippingConfigSchema.optional(),
    flashSaleConfig: updateFarmFlashSaleConfigSchema.optional(),
    isPayosEnabled: z.boolean().optional(),
    isCodEnabled: z.boolean().optional(),
  })
  .strict()
  .refine(
    (data) =>
      Object.values(data as Record<string, unknown>).some(
        (value) => value !== undefined,
      ),
    {
      message: MESSAGES.VALIDATION.AT_LEAST_ONE_FARM_SETTING_FIELD,
    },
  );

/**
 * Validated partial update payload for `PATCH /api/v1/farms/settings`.
 */
export type UpdateFarmSettingsInput = z.infer<typeof updateFarmSettingsSchema>;

/**
 * Request body DTO for `PATCH /api/v1/farms/settings`.
 */
export class UpdateFarmSettingsDto extends createZodDto(
  updateFarmSettingsSchema,
) {
  public static readonly zodSchema = updateFarmSettingsSchema;
}

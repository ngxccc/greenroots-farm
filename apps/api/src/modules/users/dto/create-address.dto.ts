import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import {
  zPhoneNumber,
  zSanitizedString,
} from "@/common/schemas/zod-primitives";

/**
 * Shared Zod field definitions for customer address contact and place inputs.
 */
export const addressInputFields = {
  receiverName: zSanitizedString({ min: 1, max: 100 }),
  phoneNumber: zPhoneNumber(),
  streetAddress: zSanitizedString({ min: 1, max: 500 }),
  placeId: z.string().trim().min(1).max(255),
} as const;

/**
 * Strict Zod schema for creating a customer delivery address.
 */
export const createAddressSchema = z
  .object({
    ...addressInputFields,
    isDefault: z.boolean().optional(),
  })
  .strict();

/**
 * Validated input payload accepted by `AddressService.createAddress`.
 */
export type CreateAddressInput = z.infer<typeof createAddressSchema>;

/**
 * Alias for `CreateAddressInput` matching the module DTO naming convention.
 */
export type CreateAddressDtoType = CreateAddressInput;

/**
 * Request DTO for creating a saved customer delivery address (`placeId` only; rejects coordinates and `city`).
 */
export class CreateAddressDto extends createZodDto(createAddressSchema) {
  public static readonly zodSchema = createAddressSchema;
}

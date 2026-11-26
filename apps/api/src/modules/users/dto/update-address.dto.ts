import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { MESSAGES } from "@/common/constants/messages.constant";
import { addressInputFields } from "./create-address.dto";

/**
 * Strict Zod schema for updating mutable fields on an existing customer address.
 */
export const updateAddressSchema = z
  .object({
    receiverName: addressInputFields.receiverName.optional(),
    phoneNumber: addressInputFields.phoneNumber.optional(),
    streetAddress: addressInputFields.streetAddress.optional(),
    placeId: addressInputFields.placeId.optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.receiverName !== undefined ||
      data.phoneNumber !== undefined ||
      data.streetAddress !== undefined ||
      data.placeId !== undefined,
    {
      message: MESSAGES.VALIDATION.AT_LEAST_ONE_ADDRESS_FIELD,
    },
  );

type AtLeastOne<T> = {
  [K in keyof T]-?: Required<Pick<T, K>> & Omit<T, K>;
}[keyof T];

/**
 * Validated partial patch payload accepted by `AddressService.updateAddress`.
 */
export type UpdateAddressInput = AtLeastOne<
  z.infer<typeof updateAddressSchema>
>;

/**
 * Alias for `UpdateAddressInput` matching the module DTO naming convention.
 */
export type UpdateAddressDtoType = UpdateAddressInput;

/**
 * Request DTO for editing address contact/location fields (`isDefault` switching uses `PATCH .../default`).
 */
export class UpdateAddressDto extends createZodDto(updateAddressSchema) {
  public static readonly zodSchema = updateAddressSchema;
}

import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { zUuidV7 } from "@/common/schemas/zod-primitives";

/**
 * Zod schema for the closed customer delivery address response projection.
 */
export const addressSchema = z.object({
  id: zUuidV7(),
  receiverName: z.string().min(1).max(100),
  phoneNumber: z.string(),
  streetAddress: z.string().min(1).max(500),
  districtCode: z.string().min(1).max(50),
  district: z.string().min(1).max(100),
  city: z.string().min(1).max(100),
  isDefault: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/**
 * Customer delivery address payload returned by address book endpoints.
 */
export type Address = z.infer<typeof addressSchema>;

/**
 * Alias for `Address` matching the module DTO naming convention.
 */
export type AddressDtoType = Address;

/**
 * Closed customer address response DTO excluding internal coordinate caches (`latitude`, `longitude`).
 */
export class AddressDto extends createZodDto(addressSchema) {
  public static readonly zodSchema = addressSchema;
}

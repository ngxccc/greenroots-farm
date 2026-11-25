import type { components } from "@/types/api-schema";

/**
 * Closed customer delivery address projection returned by `/api/v1/users/me/addresses*`.
 */
export type CustomerAddress = components["schemas"]["AddressDto"];

/**
 * Validated create-address payload accepted by `POST /api/v1/users/me/addresses`.
 */
export type CreateCustomerAddressInput =
  components["schemas"]["CreateAddressDto"];

/**
 * Validated partial-update payload accepted by `PATCH /api/v1/users/me/addresses/{id}`.
 */
export type UpdateCustomerAddressInput =
  components["schemas"]["UpdateAddressDto"];

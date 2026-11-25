import { BUSINESS_RULES, findHcmcDistrictByCode } from "@greenroots/shared";
import { z } from "zod";
import {
  VN_PHONE_ERROR_MESSAGE,
  VN_PHONE_REGEX,
  normalizeProfileFullName,
} from "@/features/auth/schemas/auth-validation";
import type {
  CreateCustomerAddressInput,
  UpdateCustomerAddressInput,
} from "@/types/address.types";

/**
 * Maximum character length for customer recipient name matching `CreateAddressDto`.
 */
export const ADDRESS_RECEIVER_NAME_MAX_LENGTH = 100;

/**
 * Maximum character length for street address lines matching `CreateAddressDto`.
 */
export const ADDRESS_STREET_MAX_LENGTH = 500;

/**
 * Maximum saved addresses allowed per customer (`BUSINESS_RULES.MAX_USER_ADDRESSES`).
 */
export const MAX_USER_ADDRESSES = BUSINESS_RULES.MAX_USER_ADDRESSES;

/**
 * Collapses repeated internal whitespace and trims leading/trailing spacing on address text fields.
 *
 * @param raw Raw text entered by the customer.
 * @returns Single-spaced trimmed string.
 */
export function normalizeAddressText(raw: string): string {
  return normalizeProfileFullName(raw);
}

/**
 * Strips all whitespace from a required customer phone string before regex validation.
 *
 * @param raw Raw phone number string from form input.
 * @returns Compact phone digit string without whitespace.
 */
export function normalizeRequiredPhone(raw: string): string {
  return raw.replace(/\s+/g, "").trim();
}

/**
 * Validates that a candidate `districtCode` belongs to the canonical 24 `HCMC_DISTRICTS` table (`INV-SF-ADDR-2`).
 *
 * @param code Candidate HCMC district identifier.
 * @returns `true` when recognized in `HCMC_DISTRICTS`.
 */
export function isValidHcmcDistrictCode(code: string): boolean {
  return findHcmcDistrictByCode(code) !== undefined;
}

const receiverNameFieldSchema = z
  .string()
  .transform(normalizeAddressText)
  .refine((value) => value.length >= 1, {
    message: "Vui lòng nhập tên người nhận.",
  })
  .refine((value) => value.length <= ADDRESS_RECEIVER_NAME_MAX_LENGTH, {
    message: `Tên người nhận không được vượt quá ${ADDRESS_RECEIVER_NAME_MAX_LENGTH} ký tự.`,
  });

const requiredPhoneFieldSchema = z
  .string()
  .transform(normalizeRequiredPhone)
  .refine((value) => VN_PHONE_REGEX.test(value), {
    message: VN_PHONE_ERROR_MESSAGE,
  });

const streetAddressFieldSchema = z
  .string()
  .transform(normalizeAddressText)
  .refine((value) => value.length >= 1, {
    message: "Vui lòng nhập số nhà, tên đường và phường/xã.",
  })
  .refine((value) => value.length <= ADDRESS_STREET_MAX_LENGTH, {
    message: `Địa chỉ chi tiết không được vượt quá ${ADDRESS_STREET_MAX_LENGTH} ký tự.`,
  });

const districtCodeFieldSchema = z
  .string()
  .trim()
  .min(1, { message: "Vui lòng chọn quận / huyện tại TP.HCM." })
  .max(50, { message: "Mã quận / huyện không hợp lệ." })
  .refine(isValidHcmcDistrictCode, {
    message: "Quận / huyện không nằm trong khu vực giao hàng TP.HCM.",
  });

/**
 * Strict schema validating customer delivery address creation inputs (`CreateAddressDto` parity).
 */
export const createAddressFormSchema = z
  .object({
    receiverName: receiverNameFieldSchema,
    phoneNumber: requiredPhoneFieldSchema,
    districtCode: districtCodeFieldSchema,
    streetAddress: streetAddressFieldSchema,
    isDefault: z.boolean().optional(),
  })
  .strict();

/**
 * Strict schema validating editable delivery address form fields (`UpdateAddressDto` parity; excludes `isDefault`).
 */
export const updateAddressFormSchema = z
  .object({
    receiverName: receiverNameFieldSchema,
    phoneNumber: requiredPhoneFieldSchema,
    districtCode: districtCodeFieldSchema,
    streetAddress: streetAddressFieldSchema,
  })
  .strict();

/**
 * Strict Server Action schema validating partial `PATCH /api/v1/users/me/addresses/{id}` payloads (`EDGE-5`).
 */
export const updateAddressPatchSchema = z
  .object({
    receiverName: receiverNameFieldSchema.optional(),
    phoneNumber: requiredPhoneFieldSchema.optional(),
    districtCode: districtCodeFieldSchema.optional(),
    streetAddress: streetAddressFieldSchema.optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.receiverName !== undefined ||
      data.phoneNumber !== undefined ||
      data.districtCode !== undefined ||
      data.streetAddress !== undefined,
    {
      message: "Vui lòng thay đổi ít nhất một thông tin địa chỉ trước khi lưu.",
    },
  );

/**
 * UUIDv7 regular expression conforming to backend `UUID_V7_REGEX` (`EDGE-6`).
 */
export const ADDRESS_UUID_V7_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Path parameter schema validating customer address UUIDv7 identifiers before API calls (`EDGE-6`).
 */
export const addressIdSchema = z.string().regex(ADDRESS_UUID_V7_REGEX, {
  message: "Mã địa chỉ không hợp lệ.",
});

/**
 * Validated create-address form input type.
 */
export type CreateAddressFormInput = CreateCustomerAddressInput;

/**
 * Form field values manipulated during Create/Edit address modal editing.
 */
export interface EditableAddressValues {
  readonly receiverName: string;
  readonly phoneNumber: string;
  readonly districtCode: string;
  readonly streetAddress: string;
}

/**
 * Result of computing minimal dirty-field diffs for editing an existing saved address.
 */
export type AddressDiffResult =
  | { readonly ok: true; readonly patch: UpdateCustomerAddressInput | null }
  | { readonly ok: false; readonly message: string };

/**
 * Validates edited address fields and extracts only modified properties against the persisted baseline
 * so empty `{}` `PATCH` submissions are prevented upfront (`INV-SF-ADDR-5`, `EDGE-1`).
 *
 * @param baseline Currently persisted `CustomerAddress` editable fields.
 * @param next Form values submitted by the customer.
 * @returns Minimal changed patch object, `null` when unchanged, or localized error copy.
 */
export function buildUpdateAddressDiff(
  baseline: EditableAddressValues,
  next: EditableAddressValues,
): AddressDiffResult {
  const parsed = updateAddressFormSchema.safeParse(next);
  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues.at(0)?.message ??
        "Vui lòng kiểm tra lại thông tin địa chỉ.",
    };
  }

  const normalizedBaseline = {
    receiverName: normalizeAddressText(baseline.receiverName),
    phoneNumber: normalizeRequiredPhone(baseline.phoneNumber),
    districtCode: baseline.districtCode.trim(),
    streetAddress: normalizeAddressText(baseline.streetAddress),
  };

  const patch: {
    receiverName?: string;
    phoneNumber?: string;
    districtCode?: string;
    streetAddress?: string;
  } = {};

  if (parsed.data.receiverName !== normalizedBaseline.receiverName) {
    patch.receiverName = parsed.data.receiverName;
  }
  if (parsed.data.phoneNumber !== normalizedBaseline.phoneNumber) {
    patch.phoneNumber = parsed.data.phoneNumber;
  }
  if (parsed.data.districtCode !== normalizedBaseline.districtCode) {
    patch.districtCode = parsed.data.districtCode;
  }
  if (parsed.data.streetAddress !== normalizedBaseline.streetAddress) {
    patch.streetAddress = parsed.data.streetAddress;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: true, patch: null };
  }

  return { ok: true, patch };
}

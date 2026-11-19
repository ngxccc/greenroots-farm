import { z } from "zod";
import { MESSAGES } from "@/common/constants/messages.constant";
import { sanitizeString } from "@/common/utils/sanitize.util";

/**
 * UUIDv7 format regular expression conforming to RFC 9562 specification (version digit 7).
 */
export const UUID_V7_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Vietnamese 10-digit mobile phone number regular expression (03x, 05x, 07x, 08x, 09x).
 */
export const VN_PHONE_REGEX = /^(0[35789])\d{8}$/;

/**
 * Vietnamese Tax ID (Mã số thuế) regular expression conforming to Circular 105/2020/TT-BTC.
 * Validates 10-digit primary enterprise codes and 13-digit branch codes (10 digits + hyphen + 3 digits).
 */
export const VN_TAX_ID_REGEX = /^\d{10}(-\d{3})?$/;

/**
 * Builds a sanitized string schema that strips HTML tags (XSS protection) and trims extra whitespace.
 */
export function zSanitizedString(options?: { min?: number; max?: number }) {
  let schema = z.string().transform((val) => {
    const sanitized = sanitizeString(val);
    const cleanStr = typeof sanitized === "string" ? sanitized : "";
    return cleanStr.replace(/\s+/g, " ").trim();
  });

  if (options?.min !== undefined) {
    const minVal = options.min;
    schema = schema.refine((val) => val.length >= minVal, {
      message:
        minVal === 1
          ? MESSAGES.VALIDATION.REQUIRED
          : MESSAGES.VALIDATION.MIN_LENGTH,
    });
  }

  if (options?.max !== undefined) {
    const maxVal = options.max;
    schema = schema.refine((val) => val.length <= maxVal, {
      message: MESSAGES.VALIDATION.MAX_LENGTH,
    });
  }

  return schema;
}

/**
 * Builds a sanitized full name schema enforcing 1 to 100 characters after trimming and HTML stripping.
 */
export function zFullName() {
  return zSanitizedString({ min: 1, max: 100 });
}

/**
 * Builds a normalized email schema that trims, lowercases, and validates email syntax.
 */
export function zEmail() {
  return z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ message: MESSAGES.VALIDATION.INVALID_EMAIL }));
}

/**
 * Builds an optional and nullable email schema that normalizes empty string inputs into null.
 */
export function zOptionalEmail() {
  return z.preprocess((val) => {
    if (typeof val === "string" && val.trim() === "") return null;
    return val;
  }, zEmail().nullable().optional());
}

/**
 * Builds a strict password schema enforcing length and complexity criteria (OWASP).
 */
export function zPassword() {
  return z
    .string()
    .min(8, { message: MESSAGES.VALIDATION.PASSWORD_MIN_LENGTH })
    .max(128, { message: MESSAGES.VALIDATION.PASSWORD_MAX_LENGTH })
    .regex(/[A-Z]/, { message: MESSAGES.VALIDATION.PASSWORD_UPPERCASE })
    .regex(/[0-9]/, { message: MESSAGES.VALIDATION.PASSWORD_NUMBER })
    .regex(/[^a-zA-Z0-9]/, { message: MESSAGES.VALIDATION.PASSWORD_SPECIAL })
    .meta({ format: "password" });
}

/**
 * Builds a 10-digit Vietnamese mobile phone number validation schema.
 */
export function zPhoneNumber() {
  return z
    .string()
    .trim()
    .regex(VN_PHONE_REGEX, { message: MESSAGES.VALIDATION.INVALID_PHONE })
    .meta({ example: "0912345678" });
}

/**
 * Builds a Vietnamese Tax ID (Mã số thuế) validation schema.
 */
export function zTaxId() {
  return z
    .string()
    .trim()
    .regex(VN_TAX_ID_REGEX, { message: MESSAGES.VALIDATION.INVALID_TAX_ID })
    .meta({ example: "0312345678" });
}

/**
 * Builds an optional and nullable Vietnamese Tax ID schema.
 */
export function zOptionalTaxId() {
  return z.preprocess((val) => {
    if (typeof val === "string" && val.trim() === "") return null;
    return val;
  }, zTaxId().nullable().optional());
}

/**
 * Builds an RFC 9562 UUIDv7 validation schema.
 */
export function zUuidV7() {
  return z
    .string()
    .regex(UUID_V7_REGEX, { message: MESSAGES.VALIDATION.INVALID_UUID })
    .meta({ example: "019315bc-3e9a-7a1b-8f3e-2b1d0a5c4e9f" });
}

/**
 * Builds a safe boolean coercion schema for query strings and JSON payloads.
 */
export function zBooleanString() {
  return z.union([
    z.boolean(),
    z.enum(["true", "false"]).transform((val) => val === "true"),
  ]);
}

/**
 * Builds a safe numeric coercion schema for query parameters and JSON numbers.
 */
export function zNumericString(options?: {
  min?: number;
  max?: number;
  integer?: boolean;
}) {
  let schema = z.union([z.number(), z.string()]).transform((val, ctx) => {
    if (typeof val === "number") return val;
    const parsed = Number(val);
    if (Number.isNaN(parsed) || val.trim() === "") {
      ctx.addIssue({
        code: "custom",
        message: MESSAGES.VALIDATION.INVALID_TYPE,
      });
    }
    return parsed;
  });

  if (options?.integer) {
    schema = schema.refine((val) => Number.isInteger(val), {
      message: MESSAGES.VALIDATION.INTEGER,
    });
  }

  if (options?.min !== undefined) {
    const minVal = options.min;
    schema = schema.refine((val) => val >= minVal, {
      message: MESSAGES.VALIDATION.MIN_VALUE,
    });
  }

  if (options?.max !== undefined) {
    const maxVal = options.max;
    schema = schema.refine((val) => val <= maxVal, {
      message: MESSAGES.VALIDATION.MAX_VALUE,
    });
  }

  return schema;
}

/**
 * Builds a coerced Date schema for query parameters and request bodies,
 * representing an ISO 8601 date-time string in OpenAPI/JSON Schema.
 */
export function zCoerceDate() {
  return z.coerce.date().meta({ format: "date-time" });
}

import { z } from "zod";
import { env } from "@/common/config/env.config";
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
 * Builds a bounded positive decimal quantity schema enforcing PostgreSQL `numeric(10, 2)` precision.
 *
 * @param options Minimum and maximum inclusive quantity bounds.
 * @returns Validated numeric schema allowing at most 2 decimal places.
 */
export function zDecimalQuantity(options: { min: number; max: number }) {
  return z
    .number()
    .min(options.min, { message: MESSAGES.VALIDATION.MIN_VALUE })
    .max(options.max, { message: MESSAGES.VALIDATION.MAX_VALUE })
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
      message: MESSAGES.VALIDATION.INVALID_QUANTITY_PRECISION,
    });
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
 * Builds a strict ISO calendar date (`YYYY-MM-DD`) validation schema.
 */
export function zIsoDate() {
  return z
    .string()
    .trim()
    .pipe(z.iso.date())
    .meta({ format: "date", example: "2026-09-01" });
}

/**
 * Builds a coerced Date schema for query parameters and request bodies,
 * representing an ISO 8601 date-time string in OpenAPI/JSON Schema.
 */
export function zCoerceDate() {
  return z.coerce.date().meta({ format: "date-time" });
}

/**
 * Options restricting Cloudinary delivery URL validation by resource type and upload folder.
 */
export interface CloudinaryMediaUrlOptions {
  readonly resourceTypes: readonly ("image" | "video")[];
  readonly folder?: string;
}

/**
 * Checks whether a parsed URL targets a configured Cloudinary HTTPS delivery prefix
 * matching the allowed resource types and optional upload folder.
 *
 * @param rawUrl Candidate URL string to inspect.
 * @param options Allowed resource types and optional destination folder constraint.
 * @returns True if the URL uses HTTPS on `res.cloudinary.com` with a matching upload path.
 */
export function isCloudinaryMediaUrl(
  rawUrl: string,
  options: CloudinaryMediaUrlOptions,
): boolean {
  if (rawUrl.includes("?") || rawUrl.includes("#")) return false;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") return false;
  if (parsed.hostname !== "res.cloudinary.com") return false;
  if (parsed.port !== "" || parsed.username !== "" || parsed.password !== "") {
    return false;
  }
  if (parsed.search !== "" || parsed.hash !== "") return false;

  const matchedPrefix = options.resourceTypes
    .map((type) => `/${env.CLOUDINARY_CLOUD_NAME}/${type}/upload/`)
    .find((prefix) => parsed.pathname.startsWith(prefix));

  if (!matchedPrefix) return false;

  const remainder = parsed.pathname.slice(matchedPrefix.length);
  if (remainder.length === 0) return false;

  const segments = remainder.split("/");
  for (const segment of segments) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return false;
    }

    if (
      decoded === "" ||
      decoded === "." ||
      decoded === ".." ||
      decoded.includes("/") ||
      decoded.includes("\\") ||
      /%[0-9a-f]{2}/i.test(decoded)
    ) {
      return false;
    }
  }

  if (options.folder !== undefined) {
    const afterVersion = /^v\d+$/.test(segments[0] ?? "")
      ? segments.slice(1)
      : segments;
    if (afterVersion[0] !== options.folder || afterVersion.length < 2) {
      return false;
    }
  }

  return true;
}

/**
 * Builds a Cloudinary HTTPS media URL schema scoped to the active cloud name,
 * allowed resource types, and optional upload folder.
 *
 * @param options Allowed resource types and optional folder scope.
 * @returns Validated URL schema.
 */
export function zCloudinaryMediaUrl(options: CloudinaryMediaUrlOptions) {
  const folderSegment = options.folder ? `${options.folder}/` : "";
  const primaryType = options.resourceTypes[0] ?? "image";

  return z
    .string()
    .trim()
    .pipe(z.url({ message: MESSAGES.VALIDATION.INVALID_URL }))
    .check((ctx) => {
      if (!isCloudinaryMediaUrl(ctx.value, options)) {
        ctx.issues.push({
          code: "invalid_format",
          format: "url",
          input: ctx.value,
          message: MESSAGES.VALIDATION.INVALID_URL,
        });
      }
    })
    .meta({
      example: `https://res.cloudinary.com/greenroots-dev/${primaryType}/upload/v1/${folderSegment}sample.webp`,
    });
}

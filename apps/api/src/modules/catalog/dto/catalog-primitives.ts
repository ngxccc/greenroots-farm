import { z } from "zod";
import { MESSAGES } from "@/common/constants/messages.constant";
import {
  zCloudinaryMediaUrl,
  zSanitizedString,
} from "@/common/schemas/zod-primitives";
import {
  MAX_CATALOG_DESCRIPTION_LENGTH,
  MAX_PRODUCT_IMAGES,
  SLUG_REGEX,
} from "../catalog.constant";

/**
 * Validates a strict lowercase kebab-case catalog slug (1..255 chars).
 */
export function zCatalogSlug() {
  return z
    .string()
    .min(1, { message: MESSAGES.VALIDATION.REQUIRED })
    .max(255, { message: MESSAGES.VALIDATION.MAX_LENGTH })
    .regex(SLUG_REGEX, { message: MESSAGES.VALIDATION.INVALID_SLUG })
    .meta({ example: "rau-an-la" });
}

/**
 * Validates an optional/nullable sanitized catalog description field,
 * normalizing empty/whitespace-only inputs to `null`.
 */
export function zCatalogDescription() {
  return z.preprocess(
    (val) => {
      if (typeof val === "string" && val.trim() === "") return null;
      return val;
    },
    zSanitizedString({ min: 1, max: MAX_CATALOG_DESCRIPTION_LENGTH })
      .nullable()
      .optional(),
  );
}

/**
 * Validates up to `MAX_PRODUCT_IMAGES` unique Cloudinary HTTPS image URLs scoped to folder `products`.
 */
export function zProductImageUrls() {
  return z
    .array(
      zCloudinaryMediaUrl({
        resourceTypes: ["image"],
        folder: "products",
      }),
    )
    .max(MAX_PRODUCT_IMAGES)
    .refine((urls) => new Set(urls).size === urls.length, {
      message: MESSAGES.VALIDATION.DUPLICATE_PRODUCT_IMAGE_URL,
    });
}

/**
 * Checks whether a partial PATCH object specifies at least one defined field.
 */
export function hasAtLeastOneDefinedField(
  data: Record<string, unknown>,
): boolean {
  return Object.values(data).some((value) => value !== undefined);
}

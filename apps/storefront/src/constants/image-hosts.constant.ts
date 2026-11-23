/**
 * Single source of truth for approved HTTPS image hostnames permitted by `next/image`
 * (`apps/storefront/next.config.ts`) and runtime storefront URL validation.
 */
export const APPROVED_REMOTE_IMAGE_HOSTS = [
  "res.cloudinary.com",
  "placehold.co",
  "img.vietqr.io",
] as const;

/** O(1) lookup set derived from {@link APPROVED_REMOTE_IMAGE_HOSTS}. */
export const APPROVED_REMOTE_IMAGE_HOST_SET: ReadonlySet<string> = new Set(
  APPROVED_REMOTE_IMAGE_HOSTS,
);

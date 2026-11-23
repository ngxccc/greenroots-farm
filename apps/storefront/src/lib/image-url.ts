import { APPROVED_REMOTE_IMAGE_HOST_SET } from "@/constants/image-hosts.constant";

/**
 * Validates that an image URL uses either an approved Next.js `remotePatterns` HTTPS host
 * or a local root-relative asset path (`/...`, excluding protocol-relative `//`).
 *
 * @param rawUrl Candidate product image URL.
 * @returns `true` when safe to pass to `next/image`.
 */
export function isApprovedStorefrontImageUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return true;
  }

  try {
    const parsed = new URL(trimmed);
    return (
      parsed.protocol === "https:" &&
      APPROVED_REMOTE_IMAGE_HOST_SET.has(parsed.hostname)
    );
  } catch {
    return false;
  }
}

/**
 * Filters a product's `imageUrls` array down to entries permitted by `next.config.ts`.
 *
 * @param imageUrls Raw `ProductDto.imageUrls` list.
 * @returns Approved image URLs preserving order.
 */
export function filterApprovedProductImages(
  imageUrls: readonly string[],
): string[] {
  return imageUrls.filter(isApprovedStorefrontImageUrl);
}

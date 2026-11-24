import { handleShippingQuotePost } from "@/lib/shipping/shipping-quote-handler";

/**
 * Storefront BFF proxy for `POST /api/v1/shipping/quote` (`ADR-0036`).
 */
export async function POST(request: Request) {
  return handleShippingQuotePost(request);
}

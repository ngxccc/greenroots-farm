import { handleUploadSignaturePost } from "@/features/orders/api/upload-signature-handler";

/**
 * Storefront BFF proxy for `POST /api/v1/media/upload-signature` (`ADR-0009`, `ADR-0036`).
 */
export async function POST(request: Request) {
  return handleUploadSignaturePost(request);
}

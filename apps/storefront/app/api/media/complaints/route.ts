import { handleComplaintMediaDelete } from "@/features/orders/api/delete-complaint-media-handler";

/**
 * Storefront BFF proxy for `DELETE /api/v1/media/complaints` (`SF-05`).
 */
export async function DELETE(request: Request) {
  return handleComplaintMediaDelete(request);
}

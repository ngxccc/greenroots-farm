import type { NextRequest } from "next/server";
import { handleLogoutPost } from "@/lib/auth/logout-handler";

/**
 * Storefront BFF endpoint for single-device customer logout.
 */
export async function POST(request: NextRequest) {
  return handleLogoutPost(request);
}

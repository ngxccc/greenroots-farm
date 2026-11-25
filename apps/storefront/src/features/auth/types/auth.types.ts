import type { components } from "@/types/api-schema";

/**
 * Authenticated customer profile projection hydrated from `GET /api/v1/users/me`.
 */
export type StorefrontSessionUser = components["schemas"]["UserProfileDto"];

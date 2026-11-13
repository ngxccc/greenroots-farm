import { SetMetadata } from "@nestjs/common";
import type { UserRole } from "@greenroots/shared";

export const ROLES_KEY = "roles";

/**
 * Restricts a controller or route to the supplied user roles.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

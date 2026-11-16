import { applyDecorators } from "@nestjs/common";
import { ApiBearerAuth } from "@nestjs/swagger";
import type { UserRole } from "@greenroots/shared";
import { Roles } from "./roles.decorator";
import {
  ApiForbiddenResponseRfc9457,
  ApiUnauthorizedResponseRfc9457,
} from "./api-rfc9457-response.decorator";

/**
 * Composite authentication and authorization decorator.
 *
 * Encapsulates role-based access control and OpenAPI security documentation:
 * - When roles are provided: applies @Roles(...roles), @ApiBearerAuth(), @ApiUnauthorizedResponseRfc9457(), and @ApiForbiddenResponseRfc9457().
 * - When roles are omitted: applies @ApiBearerAuth() and @ApiUnauthorizedResponseRfc9457().
 *   (Routes with custom business authorization can explicitly attach @ApiForbiddenResponseRfc9457()).
 *
 * @param roles - Optional role restrictions (e.g. UserRole.ADMIN, UserRole.FARM_STAFF).
 */
export function ApiAuth(...roles: UserRole[]) {
  if (roles.length > 0) {
    return applyDecorators(
      Roles(...roles),
      ApiBearerAuth(),
      ApiUnauthorizedResponseRfc9457(),
      ApiForbiddenResponseRfc9457(),
    );
  }

  return applyDecorators(ApiBearerAuth(), ApiUnauthorizedResponseRfc9457());
}

import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { ROLES_KEY } from "@/common/decorators/roles.decorator";
import { IS_PUBLIC_KEY } from "@/common/decorators/public.decorator";
import type { JwtPayload } from "@/common/decorators/current-user.decorator";
import { MESSAGES } from "@/common/constants/messages.constant";

interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

/**
 * Global role-based access control guard. Evaluates `@Roles(...)` metadata
 * after JwtAuthGuard has attached the authenticated payload.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<
      string[] | undefined
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException({
        detail: MESSAGES.COMMON.FORBIDDEN,
      });
    }

    return true;
  }
}

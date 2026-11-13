import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { UserRole } from "@greenroots/shared";

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  [key: string]: unknown;
}

/**
 * Injects the authenticated JWT payload, or a single field of it.
 */
export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;

    return data && user ? user[data] : user;
  },
);

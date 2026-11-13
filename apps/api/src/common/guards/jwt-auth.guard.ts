import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { IS_PUBLIC_KEY } from "@/common/decorators/public.decorator";
import type { JwtPayload } from "@/common/decorators/current-user.decorator";
import { MESSAGES } from "@/common/constants/messages.constant";
import { env } from "@/common/config/env.config";
import { RedisService } from "@/common/services/redis.service";

interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

/**
 * Global authentication guard.
 *
 * Besides JWT signature/expiry verification, it enforces instant revocation by
 * checking Redis key `auth:revoked:<userId>`. Redis failures are fail-open.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException({
        detail: MESSAGES.AUTH.TOKEN_MISSING,
      });
    }

    let payload: JwtPayload;

    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: env.JWT_ACCESS_SECRET,
      });
    } catch {
      throw new UnauthorizedException({
        detail: MESSAGES.AUTH.TOKEN_INVALID_OR_EXPIRED,
      });
    }

    if (!payload.sub) {
      throw new UnauthorizedException({
        detail: MESSAGES.AUTH.TOKEN_INVALID_OR_EXPIRED,
      });
    }

    if (await this.redisService.isAccessTokenRevoked(payload.sub)) {
      throw new UnauthorizedException({
        detail: MESSAGES.AUTH.TOKEN_REVOKED,
      });
    }

    request.user = payload;
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(" ") ?? [];
    return type === "Bearer" ? token : undefined;
  }
}

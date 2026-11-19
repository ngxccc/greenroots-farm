import { describe, beforeEach, it, expect, mock } from "bun:test";
import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import type { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { API_ERROR_CODES, UserRole } from "@greenroots/shared";
import { JwtAuthGuard } from "./jwt-auth.guard";
import type { RedisService } from "@/common/services/redis.service";
import type { JwtPayload } from "@/common/decorators/current-user.decorator";
import { MESSAGES } from "@/common/constants/messages.constant";

interface MockRequest extends Partial<Request> {
  headers: Record<string, string | undefined>;
  user?: JwtPayload;
}

class TestController {
  testHandler(): boolean {
    return true;
  }
}

function createMockContext(request: MockRequest): ExecutionContext {
  const controller = new TestController();
  return {
    getHandler: () => controller.testHandler,
    getClass: () => TestController,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

describe("JwtAuthGuard", () => {
  let guard: JwtAuthGuard;
  let mockJwtService: JwtService;
  let mockReflector: Reflector;
  let mockRedisService: RedisService;

  beforeEach(() => {
    mockJwtService = {
      verifyAsync: mock(),
    } as unknown as JwtService;

    mockReflector = {
      getAllAndOverride: mock().mockReturnValue(false),
    } as unknown as Reflector;

    mockRedisService = {
      isRevoked: mock().mockResolvedValue(false),
    } as unknown as RedisService;

    guard = new JwtAuthGuard(mockJwtService, mockReflector, mockRedisService);
  });

  it("bypasses authentication for public routes (@Public)", async () => {
    (
      mockReflector.getAllAndOverride as ReturnType<typeof mock>
    ).mockReturnValue(true);

    const context = createMockContext({ headers: {} });
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockJwtService.verifyAsync).not.toHaveBeenCalled();
    expect(mockRedisService.isRevoked).not.toHaveBeenCalled();
  });

  it("throws UnauthorizedException when Authorization header is missing", () => {
    const context = createMockContext({ headers: {} });

    expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException({
        code: API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED,
        detail: MESSAGES.AUTH.TOKEN_MISSING,
      }),
    );
  });

  it("throws UnauthorizedException when Authorization header is not a Bearer token", () => {
    const context = createMockContext({
      headers: {
        authorization: "Basic dXNlcjpwYXNz",
      },
    });

    expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException({
        code: API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED,
        detail: MESSAGES.AUTH.TOKEN_MISSING,
      }),
    );
  });

  it("throws UnauthorizedException when JWT verification fails or token is expired", () => {
    (mockJwtService.verifyAsync as ReturnType<typeof mock>).mockRejectedValue(
      new Error("jwt expired"),
    );

    const context = createMockContext({
      headers: {
        authorization: "Bearer invalid.jwt.token",
      },
    });

    expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException({
        code: API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED,
        detail: MESSAGES.AUTH.TOKEN_INVALID_OR_EXPIRED,
      }),
    );
  });

  it("throws UnauthorizedException when payload lacks sub property", () => {
    (mockJwtService.verifyAsync as ReturnType<typeof mock>).mockResolvedValue({
      email: "test@greenroots.farm",
      role: UserRole.CUSTOMER,
      jti: "test-jti",
    });

    const context = createMockContext({
      headers: {
        authorization: "Bearer valid.token.without.sub",
      },
    });

    expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException({
        code: API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED,
        detail: MESSAGES.AUTH.TOKEN_INVALID_OR_EXPIRED,
      }),
    );
  });

  it("throws UnauthorizedException when token or user is revoked in Redis", () => {
    const payload: JwtPayload = {
      sub: "user-123",
      email: "customer@greenroots.farm",
      role: UserRole.CUSTOMER,
      jti: "jti-revoked-uuid",
    };

    (mockJwtService.verifyAsync as ReturnType<typeof mock>).mockResolvedValue(
      payload,
    );
    (mockRedisService.isRevoked as ReturnType<typeof mock>).mockResolvedValue(
      true,
    );

    const context = createMockContext({
      headers: {
        authorization: "Bearer valid.token.revoked",
      },
    });

    expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException({
        code: API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED,
        detail: MESSAGES.AUTH.TOKEN_REVOKED,
      }),
    );
  });

  it("attaches payload to request.user and returns true when token is valid and not revoked", async () => {
    const payload: JwtPayload = {
      sub: "user-456",
      email: "staff@greenroots.farm",
      role: UserRole.FARM_STAFF,
      jti: "jti-valid-uuid",
    };

    (mockJwtService.verifyAsync as ReturnType<typeof mock>).mockResolvedValue(
      payload,
    );
    (mockRedisService.isRevoked as ReturnType<typeof mock>).mockResolvedValue(
      false,
    );

    const request: MockRequest = {
      headers: {
        authorization: "Bearer valid.jwt.token",
      },
    };
    const context = createMockContext(request);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.user).toEqual(payload);
    expect(mockRedisService.isRevoked).toHaveBeenCalledWith(
      payload.sub,
      payload.jti,
    );
  });
});

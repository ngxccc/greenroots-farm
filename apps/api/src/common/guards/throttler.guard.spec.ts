import { describe, beforeEach, it, expect, spyOn, mock } from "bun:test";
import type { ExecutionContext } from "@nestjs/common";
import { HttpException, HttpStatus } from "@nestjs/common";
import type {
  ThrottlerLimitDetail,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from "@nestjs/throttler";
import { ThrottlerGuard } from "@nestjs/throttler";
import { Reflector } from "@nestjs/core";
import { CustomThrottlerGuard } from "./throttler.guard";
import { env } from "@/common/config/env.config";
import { MESSAGES } from "@/common/constants/messages.constant";

class TestCustomThrottlerGuard extends CustomThrottlerGuard {
  public override throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    return super.throwThrottlingException(context, throttlerLimitDetail);
  }
}

describe("CustomThrottlerGuard", () => {
  let guard: TestCustomThrottlerGuard;

  beforeEach(() => {
    guard = new TestCustomThrottlerGuard(
      {} as ThrottlerModuleOptions,
      {} as ThrottlerStorage,
      new Reflector(),
    );
  });

  describe("canActivate", () => {
    it("should allow request immediately in non-production environments", async () => {
      const originalEnv = env.NODE_ENV;
      (env as { NODE_ENV: string }).NODE_ENV = "development";

      const mockContext = {} as ExecutionContext;
      const canActivate = await guard.canActivate(mockContext);

      expect(canActivate).toBe(true);

      (env as { NODE_ENV: string }).NODE_ENV = originalEnv;
    });

    it("should execute rate limit check and return true in production environment when under limit", async () => {
      const originalEnv = env.NODE_ENV;
      (env as { NODE_ENV: string }).NODE_ENV = "production";

      const superCanActivateSpy = spyOn(
        ThrottlerGuard.prototype,
        "canActivate",
      ).mockResolvedValue(true);

      const mockContext = {} as ExecutionContext;
      const canActivate = await guard.canActivate(mockContext);

      expect(canActivate).toBe(true);
      superCanActivateSpy.mockRestore();

      (env as { NODE_ENV: string }).NODE_ENV = originalEnv;
    });

    it("should re-throw HttpException when rate limit is exceeded in production", () => {
      const originalEnv = env.NODE_ENV;
      (env as { NODE_ENV: string }).NODE_ENV = "production";

      const superCanActivateSpy = spyOn(
        ThrottlerGuard.prototype,
        "canActivate",
      ).mockRejectedValue(
        new HttpException(
          { detail: MESSAGES.COMMON.TOO_MANY_REQUESTS },
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );

      const mockContext = {} as ExecutionContext;

      expect(guard.canActivate(mockContext)).rejects.toThrow(HttpException);
      superCanActivateSpy.mockRestore();

      (env as { NODE_ENV: string }).NODE_ENV = originalEnv;
    });

    it("should fail-open and return true when Redis storage throws unexpected error in production", async () => {
      const originalEnv = env.NODE_ENV;
      (env as { NODE_ENV: string }).NODE_ENV = "production";

      const superCanActivateSpy = spyOn(
        ThrottlerGuard.prototype,
        "canActivate",
      ).mockRejectedValue(new Error("Redis connection dropped"));

      const mockContext = {} as ExecutionContext;
      const canActivate = await guard.canActivate(mockContext);

      expect(canActivate).toBe(true);
      superCanActivateSpy.mockRestore();

      (env as { NODE_ENV: string }).NODE_ENV = originalEnv;
    });

    it("should fail-open and return true when rate limit check times out after 2 seconds in production", async () => {
      const originalEnv = env.NODE_ENV;
      (env as { NODE_ENV: string }).NODE_ENV = "production";

      const originalSetTimeout = globalThis.setTimeout;
      const setTimeoutMock = mock((cb: () => void) => {
        cb();
        return 0 as unknown as ReturnType<typeof setTimeout>;
      });
      globalThis.setTimeout = setTimeoutMock as unknown as typeof setTimeout;

      const superCanActivateSpy = spyOn(
        ThrottlerGuard.prototype,
        "canActivate",
      ).mockImplementation(() => new Promise<boolean>(() => undefined));

      try {
        const mockContext = {} as ExecutionContext;
        const canActivate = await guard.canActivate(mockContext);
        expect(canActivate).toBe(true);
        expect(setTimeoutMock).toHaveBeenCalled();
      } finally {
        (env as { NODE_ENV: string }).NODE_ENV = originalEnv;
        globalThis.setTimeout = originalSetTimeout;
        superCanActivateSpy.mockRestore();
      }
    });
  });

  describe("throwThrottlingException", () => {
    it("should throw HttpException with status 429 and centralized detail message", () => {
      const mockContext = {} as ExecutionContext;
      const mockLimitDetail: ThrottlerLimitDetail = {
        limit: 5,
        ttl: 60000,
        key: "test-key",
        tracker: "ip",
        totalHits: 6,
        timeToExpire: 59000,
        isBlocked: true,
        timeToBlockExpire: 59000,
      };

      try {
        void guard.throwThrottlingException(mockContext, mockLimitDetail);
        expect.unreachable("Should have thrown an HttpException");
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        const httpErr = err as HttpException;
        expect(httpErr.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect(httpErr.getResponse()).toEqual({
          detail: MESSAGES.COMMON.TOO_MANY_REQUESTS,
        });
      }
    });
  });
});

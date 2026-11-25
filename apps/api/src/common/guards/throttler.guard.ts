import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  type ExecutionContext,
} from "@nestjs/common";
import { ThrottlerGuard, type ThrottlerLimitDetail } from "@nestjs/throttler";
import type { Request } from "express";
import { API_ERROR_CODES } from "@greenroots/shared";
import { env } from "@/common/config/env.config";
import { MESSAGES } from "@/common/constants/messages.constant";
import { resolveTrustedClientIp } from "@/common/utils/client-info.util";

/**
 * Custom rate limiting guard with fail-open resilience and RFC 9457 error payloads.
 *
 * Invariants:
 * 1. Bypassed in non-production environments to avoid blocking automated tests and dev tooling.
 * 2. 2-second timeout protects incoming HTTP requests from hanging if Redis stalls.
 * 3. Catches Redis/network errors and fails open (availability over strictness).
 * 4. Throws HTTP 429 formatted for RFC 9457 Problem Details when limits are exceeded.
 */
@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected override readonly logger = new Logger(CustomThrottlerGuard.name);

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    // Disable rate limiting in non-production environments to prevent blocking automated tests and dev tooling
    if (env.NODE_ENV !== "production") {
      return true;
    }

    try {
      const { promise: timeoutPromise, reject } =
        Promise.withResolvers<never>();
      const timer = setTimeout(() => {
        reject(new Error("Rate limiting check timed out"));
      }, 2000);

      return await Promise.race([
        super.canActivate(context).finally(() => {
          clearTimeout(timer);
        }),
        timeoutPromise,
      ]);
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }
      // Fail-open resilience: prioritize API availability over strict rate limiting when Redis stalls
      this.logger.warn(
        `Rate limiter failed open: ${err instanceof Error ? err.message : String(err)}`,
      );
      return true;
    }
  }

  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    return Promise.resolve(
      resolveTrustedClientIp(req as unknown as Request) ?? "unknown",
    );
  }

  protected override throwThrottlingException(
    _context: ExecutionContext,
    _throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    throw new HttpException(
      {
        code: API_ERROR_CODES.TOO_MANY_REQUESTS,
        detail: MESSAGES.COMMON.TOO_MANY_REQUESTS,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

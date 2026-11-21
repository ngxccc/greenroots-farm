import {
  BadRequestException,
  Injectable,
  Optional,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { from, of, switchMap, tap, type Observable } from "rxjs";
import type { Request, Response } from "express";
import { API_ERROR_CODES } from "@greenroots/shared";
import { MESSAGES } from "@/common/constants/messages.constant";
import { IdempotencyService } from "@/common/services/idempotency.service";
import {
  IDEMPOTENT_METADATA_KEY,
  type IdempotentOptions,
} from "@/common/decorators/idempotent.decorator";
import type { JwtPayload } from "@/common/decorators/current-user.decorator";

interface ScopedRequest extends Request {
  user?: JwtPayload;
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly idempotencyService: IdempotencyService,
    @Optional() private readonly reflector?: Reflector,
  ) {}

  private buildScope(request: ScopedRequest): string {
    // Scope by authenticated subject and concrete request path so parameterized routes isolate per resource ID.
    const subject = request.user?.sub ?? "anonymous";
    return `${subject}:${request.method.toUpperCase()}:${request.path}`;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<ScopedRequest>();
    const response = http.getResponse<Response>();

    const options = this.reflector?.getAllAndOverride<IdempotentOptions>(
      IDEMPOTENT_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    const rawKey =
      request.headers["idempotency-key"] ?? request.headers["Idempotency-Key"];
    const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;

    if (!key) {
      if (options?.required) {
        throw new BadRequestException({
          code: API_ERROR_CODES.VALIDATION_FAILED,
          detail: MESSAGES.IDEMPOTENCY.KEY_REQUIRED,
        });
      }
      return next.handle();
    }

    const scope = this.buildScope(request);

    return from(this.idempotencyService.acquire(key, request.body, scope)).pipe(
      switchMap((result) => {
        if (!result.isNew && result.cached) {
          response.status(result.cached.statusCode);
          return of(result.cached.body);
        }

        return next.handle().pipe(
          tap({
            next: (body) => {
              void this.idempotencyService.complete(
                key,
                response.statusCode,
                body,
                options?.ttlSeconds,
                request.body,
                scope,
              );
            },
            error: () => {
              void this.idempotencyService.release(key, scope);
            },
          }),
        );
      }),
    );
  }
}

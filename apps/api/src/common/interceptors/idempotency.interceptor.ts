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
import { IdempotencyService } from "@/common/services/idempotency.service";
import {
  IDEMPOTENT_METADATA_KEY,
  type IdempotentOptions,
} from "@/common/decorators/idempotent.decorator";

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly idempotencyService: IdempotencyService,
    @Optional() private readonly reflector?: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
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
        throw new BadRequestException(
          "Thiếu header Idempotency-Key bắt buộc cho yêu cầu này",
        );
      }
      return next.handle();
    }

    return from(this.idempotencyService.acquire(key, request.body)).pipe(
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
              );
            },
            error: () => {
              void this.idempotencyService.release(key);
            },
          }),
        );
      }),
    );
  }
}

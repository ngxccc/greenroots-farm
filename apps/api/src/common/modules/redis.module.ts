import { Global, Module } from "@nestjs/common";
import { RedisService } from "@/common/services/redis.service";
import { IdempotencyService } from "@/common/services/idempotency.service";
import { IdempotencyInterceptor } from "@/common/interceptors/idempotency.interceptor";

/**
 * Global Redis connection and Idempotency provider.
 */
@Global()
@Module({
  providers: [RedisService, IdempotencyService, IdempotencyInterceptor],
  exports: [RedisService, IdempotencyService, IdempotencyInterceptor],
})
export class RedisModule {}

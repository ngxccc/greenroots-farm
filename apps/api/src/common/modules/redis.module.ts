import { Global, Module } from "@nestjs/common";
import { RedisService } from "@/common/services/redis.service";

/**
 * Global Redis connection provider. BullMQ reuses the same parsed connection
 * options from `AppModule`; no queue workers are registered in this step.
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}

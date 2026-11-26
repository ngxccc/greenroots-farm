import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { IdempotencyInterceptor } from "@/common/interceptors/idempotency.interceptor";
import { BullModule } from "@nestjs/bullmq";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { ThrottlerModule } from "@nestjs/throttler";
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";
import { AppController } from "./app.controller";
import { env } from "@/common/config/env.config";
import { parseRedisOptions } from "@/common/config/redis.config";
import { GlobalExceptionFilter } from "@/common/filters/global-exception.filter";
import { CustomThrottlerGuard } from "@/common/guards/throttler.guard";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { RolesGuard } from "@/common/guards/roles.guard";
import { RedisModule } from "@/common/modules/redis.module";
import { ZodValidationPipe } from "@/common/pipes/zod-validation.pipe";
import { DatabaseModule } from "@/database/database.module";
import { AuthModule } from "@/modules/auth/auth.module";
import { CatalogModule } from "@/modules/catalog/catalog.module";
import { ComplaintsModule } from "@/modules/complaints/complaints.module";
import { FarmsModule } from "@/modules/farms/farms.module";
import { GeocodingModule } from "@/modules/geocoding/geocoding.module";
import { InventoryModule } from "@/modules/inventory/inventory.module";
import { UsersModule } from "@/modules/users/users.module";
import { MailModule } from "@/modules/mail/mail.module";
import { MediaModule } from "@/modules/media/media.module";
import { OrdersModule } from "@/modules/orders/orders.module";
import { ShippingModule } from "@/modules/orders/shipping/shipping.module";
import { PaymentsModule } from "@/modules/payments/payments.module";
import { SubscriptionsModule } from "@/modules/subscriptions/subscriptions.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [".env"] }),
    JwtModule.register({
      global: true,
      secret: env.JWT_ACCESS_SECRET,
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: "default",
          ttl: 60000,
          limit: 100,
        },
        {
          name: "public",
          ttl: 60000,
          limit: 300,
        },
        {
          name: "auth",
          ttl: 60000,
          limit: env.NODE_ENV === "production" ? 5 : 100,
        },
      ],
      storage:
        env.NODE_ENV === "test"
          ? undefined
          : new ThrottlerStorageRedisService({
              ...parseRedisOptions(env.REDIS_URL),
              lazyConnect: true,
              enableOfflineQueue: false,
            }),
    }),
    // Connection registration only; no queue workers or processors in this step.
    BullModule.forRoot({
      connection: parseRedisOptions(env.REDIS_URL),
    }),
    DatabaseModule,
    RedisModule,
    AuthModule,
    UsersModule,
    FarmsModule,
    GeocodingModule,
    CatalogModule,
    InventoryModule,
    MailModule,
    MediaModule,
    OrdersModule,
    ShippingModule,
    PaymentsModule,
    SubscriptionsModule,
    ComplaintsModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: CustomThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
  ],
})
export class AppModule {}

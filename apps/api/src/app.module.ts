import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_PIPE } from "@nestjs/core";
import { BullModule } from "@nestjs/bullmq";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { AppController } from "./app.controller";
import { env } from "@/common/config/env.config";
import { parseRedisOptions } from "@/common/config/redis.config";
import { GlobalExceptionFilter } from "@/common/filters/global-exception.filter";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { RolesGuard } from "@/common/guards/roles.guard";
import { RedisModule } from "@/common/modules/redis.module";
import { ZodValidationPipe } from "@/common/pipes/zod-validation.pipe";
import { DatabaseModule } from "@/database/database.module";
import { AuthModule } from "@/modules/auth/auth.module";
import { CatalogModule } from "@/modules/catalog/catalog.module";
import { FarmsModule } from "@/modules/farms/farms.module";
import { InventoryModule } from "@/modules/inventory/inventory.module";
import { UsersModule } from "@/modules/users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [".env"] }),
    JwtModule.register({
      global: true,
      secret: env.JWT_ACCESS_SECRET,
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
    CatalogModule,
    InventoryModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
  ],
})
export class AppModule {}

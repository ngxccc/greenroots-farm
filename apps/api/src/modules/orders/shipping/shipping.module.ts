import { Module } from "@nestjs/common";
import { env } from "@/common/config/env.config";
import { FarmsModule } from "@/modules/farms/farms.module";
import { GeocodingModule } from "@/modules/geocoding/geocoding.module";
import { UsersModule } from "@/modules/users/users.module";
import { GoongShippingDriver } from "./drivers/goong-shipping.driver";
import { HaversineShippingDriver } from "./drivers/haversine-shipping.driver";
import { VietmapShippingDriver } from "./drivers/vietmap-shipping.driver";
import { ShippingController } from "./shipping.controller";
import { SHIPPING_DRIVER_TOKEN } from "./shipping.constant";
import { ShippingService } from "./shipping.service";

/**
 * Standalone shipping calculation module shared across orders and subscriptions
 * without creating circular module dependencies.
 */
@Module({
  imports: [UsersModule, FarmsModule, GeocodingModule],
  controllers: [ShippingController],
  providers: [
    HaversineShippingDriver,
    GoongShippingDriver,
    VietmapShippingDriver,
    {
      provide: SHIPPING_DRIVER_TOKEN,
      useFactory: (
        haversine: HaversineShippingDriver,
        goong: GoongShippingDriver,
        vietmap: VietmapShippingDriver,
      ) => {
        if (env.SHIPPING_DRIVER === "goong") {
          return goong;
        }
        if (env.SHIPPING_DRIVER === "vietmap") {
          return vietmap;
        }
        return haversine;
      },
      inject: [
        HaversineShippingDriver,
        GoongShippingDriver,
        VietmapShippingDriver,
      ],
    },
    ShippingService,
  ],
  exports: [ShippingService, SHIPPING_DRIVER_TOKEN],
})
export class ShippingModule {}

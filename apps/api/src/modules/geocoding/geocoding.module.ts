import { Module } from "@nestjs/common";
import { env } from "@/common/config/env.config";
import { GoongGeocodingDriver } from "./drivers/goong-geocoding.driver";
import { MockGeocodingDriver } from "./drivers/mock-geocoding.driver";
import { GEOCODING_DRIVER_TOKEN } from "./geocoding.constant";
import { GeocodingController } from "./geocoding.controller";
import { GeocodingService } from "./geocoding.service";

/**
 * Provides place autocomplete and server-side `placeId` coordinate resolution.
 */
@Module({
  controllers: [GeocodingController],
  providers: [
    MockGeocodingDriver,
    GoongGeocodingDriver,
    {
      provide: GEOCODING_DRIVER_TOKEN,
      useFactory: (
        mockDriver: MockGeocodingDriver,
        goongDriver: GoongGeocodingDriver,
      ) => {
        return env.GEOCODING_DRIVER === "goong" ? goongDriver : mockDriver;
      },
      inject: [MockGeocodingDriver, GoongGeocodingDriver],
    },
    GeocodingService,
  ],
  exports: [GeocodingService],
})
export class GeocodingModule {}

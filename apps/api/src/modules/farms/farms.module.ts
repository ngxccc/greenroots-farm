import { Module } from "@nestjs/common";
import { FarmSettingsController } from "./farm-settings.controller";
import { FarmSettingsService } from "./farm-settings.service";
import { FarmingLogsController } from "./farming-logs.controller";
import { FarmingLogsService } from "./farming-logs.service";
import { PlotsController } from "./plots.controller";
import { PlotsService } from "./plots.service";
import { SeasonsController } from "./seasons.controller";
import { SeasonsService } from "./seasons.service";

/**
 * Farms module hosting singleton farm settings, cultivation plots, seasons, and append-only farming logs.
 */
@Module({
  controllers: [
    FarmSettingsController,
    PlotsController,
    SeasonsController,
    FarmingLogsController,
  ],
  providers: [
    FarmSettingsService,
    PlotsService,
    SeasonsService,
    FarmingLogsService,
  ],
  exports: [
    FarmSettingsService,
    PlotsService,
    SeasonsService,
    FarmingLogsService,
  ],
})
export class FarmsModule {}

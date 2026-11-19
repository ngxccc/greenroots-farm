import { Module } from "@nestjs/common";
import { FarmSettingsController } from "./farm-settings.controller";
import { FarmSettingsService } from "./farm-settings.service";
import { PlotsController } from "./plots.controller";
import { PlotsService } from "./plots.service";
import { SeasonsController } from "./seasons.controller";
import { SeasonsService } from "./seasons.service";

/**
 * Farms module hosting singleton farm settings, cultivation plots, and seasons CRUD.
 */
@Module({
  controllers: [FarmSettingsController, PlotsController, SeasonsController],
  providers: [FarmSettingsService, PlotsService, SeasonsService],
  exports: [FarmSettingsService, PlotsService, SeasonsService],
})
export class FarmsModule {}

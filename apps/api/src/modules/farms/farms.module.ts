import { Module } from "@nestjs/common";
import { FarmSettingsController } from "./farm-settings.controller";
import { FarmSettingsService } from "./farm-settings.service";
import { PlotsController } from "./plots.controller";
import { PlotsService } from "./plots.service";

/**
 * Farms module hosting singleton farm settings and cultivation plots CRUD.
 */
@Module({
  controllers: [FarmSettingsController, PlotsController],
  providers: [FarmSettingsService, PlotsService],
  exports: [FarmSettingsService, PlotsService],
})
export class FarmsModule {}

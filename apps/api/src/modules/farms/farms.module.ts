import { Module } from "@nestjs/common";
import { FarmSettingsController } from "./farm-settings.controller";
import { FarmSettingsService } from "./farm-settings.service";
import { FarmingLogsController } from "./farming-logs.controller";
import { FarmingLogsService } from "./farming-logs.service";
import { PlotsController } from "./plots.controller";
import { PlotsService } from "./plots.service";
import { SeasonsController } from "./seasons.controller";
import { SeasonsService } from "./seasons.service";
import { TraceCacheService } from "./trace-cache.service";
import { TraceController } from "./trace.controller";
import { TraceService } from "./trace.service";

/**
 * Farms module hosting singleton farm settings, cultivation plots, seasons,
 * append-only farming logs, and public QR batch traceability.
 */
@Module({
  controllers: [
    FarmSettingsController,
    PlotsController,
    SeasonsController,
    FarmingLogsController,
    TraceController,
  ],
  providers: [
    FarmSettingsService,
    PlotsService,
    SeasonsService,
    FarmingLogsService,
    TraceCacheService,
    TraceService,
  ],
  exports: [
    FarmSettingsService,
    PlotsService,
    SeasonsService,
    FarmingLogsService,
    TraceCacheService,
  ],
})
export class FarmsModule {}

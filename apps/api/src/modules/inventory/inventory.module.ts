import { Module } from "@nestjs/common";
import { FarmsModule } from "@/modules/farms/farms.module";
import { BatchesController } from "./batches.controller";
import { BatchesService } from "./batches.service";
import { WasteLogsController } from "./waste-logs.controller";
import { WasteLogsService } from "./waste-logs.service";

/**
 * Inventory module hosting batch intake, shelf-life tracking,
 * QR label generation, and two-step waste write-off workflows.
 */
@Module({
  imports: [FarmsModule],
  controllers: [BatchesController, WasteLogsController],
  providers: [BatchesService, WasteLogsService],
  exports: [BatchesService, WasteLogsService],
})
export class InventoryModule {}

import { Module } from "@nestjs/common";
import { FarmsModule } from "@/modules/farms/farms.module";
import { BatchesController } from "./batches.controller";
import { BatchesExpiryService } from "./batches-expiry.service";
import { BatchesService } from "./batches.service";
import { InventoryController } from "./inventory.controller";
import { WasteLogsController } from "./waste-logs.controller";
import { WasteLogsService } from "./waste-logs.service";

/**
 * Inventory module hosting batch intake, shelf-life tracking,
 * periodic expiry transitions, QR label generation, and two-step waste write-off workflows.
 */
@Module({
  imports: [FarmsModule],
  controllers: [BatchesController, InventoryController, WasteLogsController],
  providers: [BatchesService, BatchesExpiryService, WasteLogsService],
  exports: [BatchesService, BatchesExpiryService, WasteLogsService],
})
export class InventoryModule {}

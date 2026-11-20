import { Module } from "@nestjs/common";
import { FarmsModule } from "@/modules/farms/farms.module";
import { BatchesController } from "./batches.controller";
import { BatchesService } from "./batches.service";

/**
 * Inventory module hosting batch intake, shelf-life tracking,
 * and future FEFO allocation and waste write-off workflows.
 */
@Module({
  imports: [FarmsModule],
  controllers: [BatchesController],
  providers: [BatchesService],
  exports: [BatchesService],
})
export class InventoryModule {}

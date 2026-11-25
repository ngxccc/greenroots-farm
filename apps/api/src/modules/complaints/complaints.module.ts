import { Module } from "@nestjs/common";
import { MediaModule } from "@/modules/media/media.module";
import { ComplaintsController } from "./complaints.controller";
import { ComplaintsService } from "./complaints.service";

/**
 * Customer complaint submission domain module (`ADR-0040`).
 */
@Module({
  imports: [MediaModule],
  controllers: [ComplaintsController],
  providers: [ComplaintsService],
  exports: [ComplaintsService],
})
export class ComplaintsModule {}

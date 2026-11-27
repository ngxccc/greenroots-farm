import { Module } from "@nestjs/common";
import { MediaModule } from "@/modules/media/media.module";
import { ComplaintsController } from "./complaints.controller";
import { ComplaintsStaffController } from "./complaints-staff.controller";
import { ComplaintsService } from "./complaints.service";

/**
 * Customer complaint submission and staff triage domain module (`ADR-0040`, `ADR-0045`).
 */
@Module({
  imports: [MediaModule],
  controllers: [ComplaintsController, ComplaintsStaffController],
  providers: [ComplaintsService],
  exports: [ComplaintsService],
})
export class ComplaintsModule {}

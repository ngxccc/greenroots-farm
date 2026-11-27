import { Body, Controller, Get, Param, Patch, Query } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import {
  ApiAuth,
  ApiBadRequestResponseRfc9457,
  ApiInternalServerErrorResponseRfc9457,
  ApiNotFoundResponseRfc9457,
  ApiOkResponseGeneric,
  ApiOkResponsePaginated,
  ApiTooManyRequestsResponseRfc9457,
  ApiUnprocessableEntityResponseRfc9457,
  CurrentUser,
} from "@/common/decorators";
import type { PaginationMetaDto } from "@/common/dto/api-response.dto";
import { ZodValidationPipe } from "@/common/pipes/zod-validation.pipe";
import { zUuidV7 } from "@/common/schemas/zod-primitives";
import { apiSuccess, type ApiResponse } from "@/common/utils/api-response.util";
import { COMPLAINTS_STAFF_ALLOWED_ROLES } from "./complaints.constant";
import { COMPLAINTS_ROUTES } from "./complaints.routes";
import { ComplaintsService } from "./complaints.service";
import {
  ListComplaintsQueryDto,
  StaffComplaintDto,
  TriageComplaintDto,
  type StaffComplaintProjection,
} from "./dto";

/**
 * Staff complaint listing and triage endpoints (`/api/v1/complaints`, `ADR-0045`).
 */
@ApiTags(COMPLAINTS_ROUTES.TAG)
@Controller({ path: COMPLAINTS_ROUTES.BASE, version: "1" })
@ApiBadRequestResponseRfc9457()
@ApiInternalServerErrorResponseRfc9457()
export class ComplaintsStaffController {
  constructor(private readonly complaintsService: ComplaintsService) {}

  @Get()
  @ApiAuth(...COMPLAINTS_STAFF_ALLOWED_ROLES)
  @ApiOperation({
    summary: "List customer complaints for staff review",
    description:
      "Returns a paginated, filtered, and searchable list of complaints hydrated with order and customer context, sorted newest first.",
  })
  @ApiOkResponsePaginated(StaffComplaintDto)
  @ApiTooManyRequestsResponseRfc9457()
  async listComplaints(
    @Query() query: ListComplaintsQueryDto,
  ): Promise<ApiResponse<StaffComplaintProjection[], PaginationMetaDto>> {
    const { items, meta } = await this.complaintsService.listComplaints(query);
    return apiSuccess(items, meta);
  }

  @Patch(COMPLAINTS_ROUTES.TRIAGE)
  @ApiAuth(...COMPLAINTS_STAFF_ALLOWED_ROLES)
  @ApiOperation({
    summary: "Triage a pending customer complaint",
    description:
      "Transitions a pending complaint to triaged or rejected under a row-level lock, recording staff attribution and mandatory rejection rationale.",
  })
  @ApiParam({
    name: "id",
    type: "string",
    format: "uuid",
    description: "Complaint UUIDv7 identifier",
  })
  @ApiOkResponseGeneric(StaffComplaintDto)
  @ApiNotFoundResponseRfc9457()
  @ApiUnprocessableEntityResponseRfc9457()
  @ApiTooManyRequestsResponseRfc9457()
  async triageComplaint(
    @Param("id", new ZodValidationPipe(zUuidV7())) complaintId: string,
    @CurrentUser("sub") actorId: string,
    @Body() dto: TriageComplaintDto,
  ): Promise<ApiResponse<StaffComplaintProjection>> {
    const complaint = await this.complaintsService.triageComplaint(
      actorId,
      complaintId,
      dto,
    );
    return apiSuccess(complaint);
  }
}

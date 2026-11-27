import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import type { UserRole } from "@greenroots/shared";
import {
  ApiAuth,
  ApiBadRequestResponseRfc9457,
  ApiConflictResponseRfc9457,
  ApiInternalServerErrorResponseRfc9457,
  ApiNotFoundResponseRfc9457,
  ApiOkResponseGeneric,
  ApiOkResponsePaginated,
  ApiRfc9457Response,
  ApiTooManyRequestsResponseRfc9457,
  ApiUnprocessableEntityResponseRfc9457,
  CurrentUser,
  Idempotent,
} from "@/common/decorators";
import { IDEMPOTENCY_HEADER_NAME } from "@/common/constants/idempotency.constant";
import { ERROR_SLUGS, MESSAGES } from "@/common/constants/messages.constant";
import type { PaginationMetaDto } from "@/common/dto/api-response.dto";
import { ZodValidationPipe } from "@/common/pipes/zod-validation.pipe";
import { zUuidV7 } from "@/common/schemas/zod-primitives";
import { apiSuccess, type ApiResponse } from "@/common/utils/api-response.util";
import {
  COMPLAINTS_RESOLVE_ALLOWED_ROLES,
  COMPLAINTS_STAFF_ALLOWED_ROLES,
} from "./complaints.constant";
import { COMPLAINTS_ROUTES } from "./complaints.routes";
import { ComplaintsService } from "./complaints.service";
import {
  ListComplaintsQueryDto,
  ResolveComplaintDto,
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
    summary: "Triage a customer complaint",
    description:
      "Transitions a pending complaint to triaged or rejected (or allows Admin/SuperAdmin to override triaged to rejected) under a row-level lock, recording staff attribution and mandatory rejection rationale.",
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
    @CurrentUser("role") actorRole: UserRole,
    @Body() dto: TriageComplaintDto,
  ): Promise<ApiResponse<StaffComplaintProjection>> {
    const complaint = await this.complaintsService.triageComplaint(
      actorId,
      actorRole,
      complaintId,
      dto,
    );
    return apiSuccess(complaint);
  }

  @Post(COMPLAINTS_ROUTES.RESOLVE)
  @ApiAuth(...COMPLAINTS_RESOLVE_ALLOWED_ROLES)
  @Idempotent({ required: true })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Resolve a triaged customer complaint",
    description:
      "Atomically transitions a triaged complaint to approved via either a dual-channel refund (bank_transfer ledger or loyalty_points credit) or a 0đ FEFO-allocated replacement order.",
  })
  @ApiParam({
    name: "id",
    type: "string",
    format: "uuid",
    description: "Complaint UUIDv7 identifier",
  })
  @ApiHeader({
    name: IDEMPOTENCY_HEADER_NAME,
    required: true,
    schema: { type: "string", format: "uuid" },
    description:
      "Required UUID idempotency key caching mutation responses for 24 hours per authenticated staff actor and endpoint.",
  })
  @ApiOkResponseGeneric(StaffComplaintDto)
  @ApiNotFoundResponseRfc9457()
  @ApiConflictResponseRfc9457()
  @ApiUnprocessableEntityResponseRfc9457()
  @ApiTooManyRequestsResponseRfc9457()
  @ApiRfc9457Response({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description: "Idempotency store unavailable (Service Unavailable)",
    title: "Service Unavailable",
    detail: MESSAGES.COMMON.SERVICE_UNAVAILABLE,
    typeSlug: ERROR_SLUGS.SERVICE_UNAVAILABLE,
  })
  async resolveComplaint(
    @Param("id", new ZodValidationPipe(zUuidV7())) complaintId: string,
    @CurrentUser("sub") actorId: string,
    @Body() dto: ResolveComplaintDto,
  ): Promise<ApiResponse<StaffComplaintProjection>> {
    const complaint = await this.complaintsService.resolveComplaint(
      actorId,
      complaintId,
      dto,
    );
    return apiSuccess(complaint);
  }
}

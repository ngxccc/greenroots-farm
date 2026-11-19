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
import { ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@greenroots/shared";
import {
  ApiAuth,
  ApiBadRequestResponseRfc9457,
  ApiConflictResponseRfc9457,
  ApiCreatedResponseGeneric,
  ApiInternalServerErrorResponseRfc9457,
  ApiNotFoundResponseRfc9457,
  ApiOkResponseGeneric,
  ApiOkResponsePaginated,
  ApiUnprocessableEntityResponseRfc9457,
  CurrentUser,
  type JwtPayload,
} from "@/common/decorators";
import { ZodValidationPipe } from "@/common/pipes/zod-validation.pipe";
import { zUuidV7 } from "@/common/schemas/zod-primitives";
import { apiSuccess, type ApiResponse } from "@/common/utils/api-response.util";
import type { PaginationMetaDto } from "@/common/dto/api-response.dto";
import {
  CreateStaffDto,
  ListStaffQueryDto,
  StaffMemberDto,
  UpdateStaffDto,
  type StaffMember,
} from "./dto";
import { StaffService } from "./staff.service";
import { USERS_ROUTES } from "./users.routes";

/**
 * Staff directory, onboarding, role/status governance, and credential-reset endpoints (`/api/v1/admin/users`).
 */
@ApiTags(USERS_ROUTES.ADMIN_TAG)
@Controller({ path: USERS_ROUTES.ADMIN_BASE, version: "1" })
@ApiBadRequestResponseRfc9457()
@ApiInternalServerErrorResponseRfc9457()
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @ApiAuth(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "List staff members",
    description:
      "Returns a paginated staff directory restricted to internal staff roles, supporting role, status, search, and sorting.",
  })
  @ApiOkResponsePaginated(StaffMemberDto)
  @ApiUnprocessableEntityResponseRfc9457()
  async list(
    @Query() query: ListStaffQueryDto,
  ): Promise<ApiResponse<StaffMember[], PaginationMetaDto>> {
    const { items, meta } = await this.staffService.listStaff(query);
    return apiSuccess(items, meta);
  }

  @Post()
  @ApiAuth(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "Create and invite a staff account",
    description:
      "Creates an unverified staff user with an unusable password hash and a 24-hour reset token emailed to Backoffice.",
  })
  @ApiCreatedResponseGeneric(StaffMemberDto)
  @ApiConflictResponseRfc9457()
  @ApiUnprocessableEntityResponseRfc9457()
  async create(
    @CurrentUser("sub") actorId: string,
    @Body() dto: CreateStaffDto,
  ): Promise<ApiResponse<StaffMember>> {
    const created = await this.staffService.createStaff(actorId, dto);
    return apiSuccess(created);
  }

  @Patch(USERS_ROUTES.ADMIN_BY_ID)
  @ApiAuth(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "Update staff profile, role, or status",
    description:
      "Allows admins to edit fullName/phone and super_admins to additionally update role/status with last-super-admin protection and session revocation.",
  })
  @ApiParam({
    name: "id",
    type: "string",
    format: "uuid",
    description: "Staff member UUIDv7 identifier",
  })
  @ApiOkResponseGeneric(StaffMemberDto)
  @ApiNotFoundResponseRfc9457()
  @ApiUnprocessableEntityResponseRfc9457()
  async update(
    @CurrentUser() actor: JwtPayload,
    @Param("id", new ZodValidationPipe(zUuidV7())) id: string,
    @Body() dto: UpdateStaffDto,
  ): Promise<ApiResponse<StaffMember>> {
    const updated = await this.staffService.updateStaff(actor, id, dto);
    return apiSuccess(updated);
  }

  @Post(USERS_ROUTES.ADMIN_RESET_CREDENTIALS)
  @HttpCode(HttpStatus.OK)
  @ApiAuth(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "Trigger staff credential reset",
    description:
      "Revokes all active sessions for the target active staff account, writes an audit row, and emails a 24-hour Backoffice reset link.",
  })
  @ApiParam({
    name: "id",
    type: "string",
    format: "uuid",
    description: "Staff member UUIDv7 identifier",
  })
  @ApiOkResponseGeneric(StaffMemberDto)
  @ApiNotFoundResponseRfc9457()
  @ApiUnprocessableEntityResponseRfc9457()
  async resetCredentials(
    @CurrentUser("sub") actorId: string,
    @Param("id", new ZodValidationPipe(zUuidV7())) id: string,
  ): Promise<ApiResponse<StaffMember>> {
    const staff = await this.staffService.resetCredentials(actorId, id);
    return apiSuccess(staff);
  }
}

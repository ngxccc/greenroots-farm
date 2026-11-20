import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@greenroots/shared";
import { IDEMPOTENCY_HEADER_NAME } from "@/common/constants/idempotency.constant";
import { ERROR_SLUGS, MESSAGES } from "@/common/constants/messages.constant";
import {
  ApiAuth,
  ApiBadRequestResponseRfc9457,
  ApiConflictResponseRfc9457,
  ApiCreatedResponseGeneric,
  ApiInternalServerErrorResponseRfc9457,
  ApiNotFoundResponseRfc9457,
  ApiOkResponseGeneric,
  ApiOkResponsePaginated,
  ApiRfc9457Response,
  ApiUnprocessableEntityResponseRfc9457,
  CurrentUser,
  Idempotent,
  type JwtPayload,
} from "@/common/decorators";
import type { PaginationMetaDto } from "@/common/dto/api-response.dto";
import { ZodValidationPipe } from "@/common/pipes/zod-validation.pipe";
import { zUuidV7 } from "@/common/schemas/zod-primitives";
import { apiSuccess, type ApiResponse } from "@/common/utils/api-response.util";
import {
  approveWasteLogSchema,
  CreateWasteLogDto,
  ListWasteLogsQueryDto,
  RejectWasteLogDto,
  WasteLogDto,
  type WasteLogProjection,
} from "./dto";
import { INVENTORY_ROUTES } from "./inventory.routes";
import { WasteLogsService } from "./waste-logs.service";

/**
 * Two-step inventory waste write-off proposal and review endpoints (`/api/v1/waste-logs`).
 */
@ApiTags(INVENTORY_ROUTES.TAG)
@Controller({ path: INVENTORY_ROUTES.WASTE_LOGS_BASE, version: "1" })
@ApiBadRequestResponseRfc9457()
@ApiInternalServerErrorResponseRfc9457()
export class WasteLogsController {
  constructor(private readonly wasteLogsService: WasteLogsService) {}

  @Post()
  @ApiAuth(UserRole.FARM_STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Idempotent({ required: true })
  @ApiOperation({
    summary: "Create a pending waste write-off proposal",
    description:
      "Creates a pending_approval waste log with photographic proof without deducting sellable batch stock.",
  })
  @ApiHeader({
    name: IDEMPOTENCY_HEADER_NAME,
    required: true,
    schema: { type: "string", format: "uuid" },
    description:
      "Required UUID idempotency key caching mutation responses for 24 hours.",
  })
  @ApiCreatedResponseGeneric(WasteLogDto)
  @ApiNotFoundResponseRfc9457()
  @ApiConflictResponseRfc9457()
  @ApiUnprocessableEntityResponseRfc9457()
  @ApiRfc9457Response({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description: "Idempotency store unavailable (Service Unavailable)",
    title: "Service Unavailable",
    detail: MESSAGES.COMMON.SERVICE_UNAVAILABLE,
    typeSlug: ERROR_SLUGS.SERVICE_UNAVAILABLE,
  })
  async create(
    @Body() dto: CreateWasteLogDto,
    @CurrentUser() actor: JwtPayload,
  ): Promise<ApiResponse<WasteLogProjection>> {
    const created = await this.wasteLogsService.createWasteLog(dto, actor);
    return apiSuccess(created);
  }

  @Get()
  @ApiAuth(UserRole.FARM_STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "List waste write-off logs",
    description:
      "Returns a paginated list of waste logs. Farm staff see only their own proposals; admins and super admins see all records.",
  })
  @ApiOkResponsePaginated(WasteLogDto)
  async list(
    @Query() query: ListWasteLogsQueryDto,
    @CurrentUser() actor: JwtPayload,
  ): Promise<ApiResponse<WasteLogProjection[], PaginationMetaDto>> {
    const { items, meta } = await this.wasteLogsService.listWasteLogs(
      query,
      actor,
    );
    return apiSuccess(items, meta);
  }

  @Get(INVENTORY_ROUTES.WASTE_LOG_BY_ID)
  @ApiAuth(UserRole.FARM_STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "Get a waste write-off log by ID",
    description:
      "Returns a single waste log with batch, reporter, and reviewer summaries.",
  })
  @ApiParam({
    name: "id",
    type: "string",
    format: "uuid",
    description: "Waste log UUIDv7 identifier",
  })
  @ApiOkResponseGeneric(WasteLogDto)
  @ApiNotFoundResponseRfc9457()
  async getById(
    @Param("id", new ZodValidationPipe(zUuidV7())) id: string,
    @CurrentUser() actor: JwtPayload,
  ): Promise<ApiResponse<WasteLogProjection>> {
    const wasteLog = await this.wasteLogsService.getWasteLogById(id, actor);
    return apiSuccess(wasteLog);
  }

  @Post(INVENTORY_ROUTES.WASTE_LOG_APPROVE)
  @HttpCode(HttpStatus.OK)
  @ApiAuth(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Idempotent({ required: true })
  @ApiOperation({
    summary: "Approve a pending waste write-off proposal",
    description:
      "Atomically approves a pending waste log, enforces 4-eyes non-self-review, and deducts batch availableQuantity.",
  })
  @ApiParam({
    name: "id",
    type: "string",
    format: "uuid",
    description: "Waste log UUIDv7 identifier",
  })
  @ApiHeader({
    name: IDEMPOTENCY_HEADER_NAME,
    required: true,
    schema: { type: "string", format: "uuid" },
    description:
      "Required UUID idempotency key caching mutation responses for 24 hours.",
  })
  @ApiOkResponseGeneric(WasteLogDto)
  @ApiNotFoundResponseRfc9457()
  @ApiConflictResponseRfc9457()
  @ApiUnprocessableEntityResponseRfc9457()
  @ApiRfc9457Response({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description: "Idempotency store unavailable (Service Unavailable)",
    title: "Service Unavailable",
    detail: MESSAGES.COMMON.SERVICE_UNAVAILABLE,
    typeSlug: ERROR_SLUGS.SERVICE_UNAVAILABLE,
  })
  async approve(
    @Param("id", new ZodValidationPipe(zUuidV7())) id: string,
    @Body(new ZodValidationPipe(approveWasteLogSchema))
    _body: Record<string, never>,
    @CurrentUser() actor: JwtPayload,
  ): Promise<ApiResponse<WasteLogProjection>> {
    const approved = await this.wasteLogsService.approveWasteLog(id, actor);
    return apiSuccess(approved);
  }

  @Post(INVENTORY_ROUTES.WASTE_LOG_REJECT)
  @HttpCode(HttpStatus.OK)
  @ApiAuth(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Idempotent({ required: true })
  @ApiOperation({
    summary: "Reject a pending waste write-off proposal",
    description:
      "Atomically rejects a pending waste log with a mandatory rejection reason and enforces 4-eyes non-self-review.",
  })
  @ApiParam({
    name: "id",
    type: "string",
    format: "uuid",
    description: "Waste log UUIDv7 identifier",
  })
  @ApiHeader({
    name: IDEMPOTENCY_HEADER_NAME,
    required: true,
    schema: { type: "string", format: "uuid" },
    description:
      "Required UUID idempotency key caching mutation responses for 24 hours.",
  })
  @ApiOkResponseGeneric(WasteLogDto)
  @ApiNotFoundResponseRfc9457()
  @ApiConflictResponseRfc9457()
  @ApiUnprocessableEntityResponseRfc9457()
  @ApiRfc9457Response({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description: "Idempotency store unavailable (Service Unavailable)",
    title: "Service Unavailable",
    detail: MESSAGES.COMMON.SERVICE_UNAVAILABLE,
    typeSlug: ERROR_SLUGS.SERVICE_UNAVAILABLE,
  })
  async reject(
    @Param("id", new ZodValidationPipe(zUuidV7())) id: string,
    @Body() dto: RejectWasteLogDto,
    @CurrentUser() actor: JwtPayload,
  ): Promise<ApiResponse<WasteLogProjection>> {
    const rejected = await this.wasteLogsService.rejectWasteLog(id, dto, actor);
    return apiSuccess(rejected);
  }
}

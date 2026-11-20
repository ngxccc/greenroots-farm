import {
  Body,
  Controller,
  Get,
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
  ApiOkResponsePaginated,
  ApiRfc9457Response,
  ApiUnprocessableEntityResponseRfc9457,
  CurrentUser,
  Idempotent,
} from "@/common/decorators";
import type { PaginationMetaDto } from "@/common/dto/api-response.dto";
import { ZodValidationPipe } from "@/common/pipes/zod-validation.pipe";
import { zUuidV7 } from "@/common/schemas/zod-primitives";
import { apiSuccess, type ApiResponse } from "@/common/utils/api-response.util";
import {
  CreateFarmingLogDto,
  FarmingLogDto,
  ListFarmingLogsQueryDto,
  type FarmingLogProjection,
} from "./dto";
import { FarmingLogsService } from "./farming-logs.service";
import { FARMS_ROUTES } from "./farms.routes";

/**
 * Append-only cultivation log endpoints (`/api/v1/seasons/:id/logs`).
 */
@ApiTags(FARMS_ROUTES.TAG)
@Controller({ path: FARMS_ROUTES.SEASON_LOGS_BASE, version: "1" })
@ApiBadRequestResponseRfc9457()
@ApiInternalServerErrorResponseRfc9457()
export class FarmingLogsController {
  constructor(private readonly farmingLogsService: FarmingLogsService) {}

  @Get()
  @ApiAuth(UserRole.FARM_STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "List append-only farming logs for a season",
    description:
      "Returns paginated cultivation logs ordered by action date with staff attribution and bidirectional correction linkage.",
  })
  @ApiParam({
    name: "id",
    type: "string",
    format: "uuid",
    description: "Season UUIDv7 identifier",
  })
  @ApiOkResponsePaginated(FarmingLogDto)
  @ApiNotFoundResponseRfc9457()
  async list(
    @Param("id", new ZodValidationPipe(zUuidV7())) seasonId: string,
    @Query() query: ListFarmingLogsQueryDto,
  ): Promise<ApiResponse<FarmingLogProjection[], PaginationMetaDto>> {
    const { items, meta } = await this.farmingLogsService.listLogs(
      seasonId,
      query,
    );
    return apiSuccess(items, meta);
  }

  @Post()
  @ApiAuth(UserRole.FARM_STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Idempotent()
  @ApiOperation({
    summary: "Append an immutable farming log or correction entry",
    description:
      "Creates an append-only farming log for a season with validated actionType, optional Cloudinary mediaUrls under farming_logs, and optional same-season correctsLogId when actionType is correction.",
  })
  @ApiHeader({
    name: IDEMPOTENCY_HEADER_NAME,
    required: false,
    schema: { type: "string", format: "uuid" },
    description:
      "Optional UUID idempotency key caching mutation responses for 24 hours.",
  })
  @ApiParam({
    name: "id",
    type: "string",
    format: "uuid",
    description: "Season UUIDv7 identifier",
  })
  @ApiCreatedResponseGeneric(FarmingLogDto)
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
    @Param("id", new ZodValidationPipe(zUuidV7())) seasonId: string,
    @CurrentUser("sub") staffId: string,
    @Body() dto: CreateFarmingLogDto,
  ): Promise<ApiResponse<FarmingLogProjection>> {
    const created = await this.farmingLogsService.createLog(
      seasonId,
      staffId,
      dto,
    );
    return apiSuccess(created);
  }
}

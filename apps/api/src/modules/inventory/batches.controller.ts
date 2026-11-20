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
  ApiOkResponseGeneric,
  ApiOkResponsePaginated,
  ApiRfc9457Response,
  ApiUnprocessableEntityResponseRfc9457,
  Idempotent,
} from "@/common/decorators";
import type { PaginationMetaDto } from "@/common/dto/api-response.dto";
import { ZodValidationPipe } from "@/common/pipes/zod-validation.pipe";
import { zUuidV7 } from "@/common/schemas/zod-primitives";
import { apiSuccess, type ApiResponse } from "@/common/utils/api-response.util";
import { BatchesService } from "./batches.service";
import {
  BatchDto,
  CreateBatchDto,
  ListBatchesQueryDto,
  type BatchProjection,
} from "./dto";
import { INVENTORY_ROUTES } from "./inventory.routes";

/**
 * Inventory batch intake and stock inspection endpoints (`/api/v1/batches`).
 */
@ApiTags(INVENTORY_ROUTES.TAG)
@Controller({ path: INVENTORY_ROUTES.BATCHES_BASE, version: "1" })
@ApiBadRequestResponseRfc9457()
@ApiInternalServerErrorResponseRfc9457()
export class BatchesController {
  constructor(private readonly batchesService: BatchesService) {}

  @Post()
  @ApiAuth(UserRole.FARM_STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Idempotent({ required: true })
  @ApiOperation({
    summary: "Create a harvested inventory batch",
    description:
      "Creates a batch with a server-generated batchCode, instant-based expirationDate derived from shelfLifeDays, initial stock equality, and threshold-derived status.",
  })
  @ApiHeader({
    name: IDEMPOTENCY_HEADER_NAME,
    required: true,
    schema: { type: "string", format: "uuid" },
    description:
      "Required UUID idempotency key caching mutation responses for 24 hours.",
  })
  @ApiCreatedResponseGeneric(BatchDto)
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
    @Body() dto: CreateBatchDto,
  ): Promise<ApiResponse<BatchProjection>> {
    const created = await this.batchesService.createBatch(dto);
    return apiSuccess(created);
  }

  @Get()
  @ApiAuth(UserRole.FARM_STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "List inventory batches",
    description:
      "Returns a paginated list of inventory batches with product, season, status, and batchCode search filters.",
  })
  @ApiOkResponsePaginated(BatchDto)
  async list(
    @Query() query: ListBatchesQueryDto,
  ): Promise<ApiResponse<BatchProjection[], PaginationMetaDto>> {
    const { items, meta } = await this.batchesService.listBatches(query);
    return apiSuccess(items, meta);
  }

  @Get(INVENTORY_ROUTES.BATCH_BY_ID)
  @ApiAuth(UserRole.FARM_STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "Get an inventory batch by ID",
    description:
      "Returns a single inventory batch with nested product and cultivation season summaries.",
  })
  @ApiParam({
    name: "id",
    type: "string",
    format: "uuid",
    description: "Batch UUIDv7 identifier",
  })
  @ApiOkResponseGeneric(BatchDto)
  @ApiNotFoundResponseRfc9457()
  async getById(
    @Param("id", new ZodValidationPipe(zUuidV7())) id: string,
  ): Promise<ApiResponse<BatchProjection>> {
    const batch = await this.batchesService.getBatchById(id);
    return apiSuccess(batch);
  }
}

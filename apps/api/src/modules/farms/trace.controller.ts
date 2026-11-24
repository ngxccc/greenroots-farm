import { Controller, Get, Header, Param, Query } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import {
  ApiBadRequestResponseRfc9457,
  ApiInternalServerErrorResponseRfc9457,
  ApiNotFoundResponseRfc9457,
  ApiOkResponseGeneric,
  ApiTooManyRequestsResponseRfc9457,
  Public,
} from "@/common/decorators";
import { ZodValidationPipe } from "@/common/pipes/zod-validation.pipe";
import { apiSuccess, type ApiResponse } from "@/common/utils/api-response.util";
import {
  batchCodeParamSchema,
  ListRecentTraceQueryDto,
  RecentTraceBatchItemDto,
  TraceRecordDto,
  type RecentTraceBatchItemProjection,
  type TraceRecordProjection,
} from "./dto";
import { FARMS_ROUTES } from "./farms.routes";
import { TraceService } from "./trace.service";

/**
 * Public QR batch traceability endpoints (`/api/v1/trace`).
 */
@ApiTags(FARMS_ROUTES.TAG)
@Controller({ path: FARMS_ROUTES.TRACE_BASE, version: "1" })
@ApiBadRequestResponseRfc9457()
@ApiInternalServerErrorResponseRfc9457()
export class TraceController {
  constructor(private readonly traceService: TraceService) {}

  @Get()
  @Public()
  @SkipThrottle({ default: true, auth: true })
  @Throttle({
    public: { limit: 300, ttl: 60000 },
  })
  @Header("Cache-Control", "no-cache")
  @ApiOperation({
    summary: "List recent harvested batches for public QR lookup",
    description:
      "Returns redacted summaries of the most recently harvested active batches for the storefront /trace directory.",
  })
  @ApiOkResponseGeneric(RecentTraceBatchItemDto, { isArray: true })
  @ApiTooManyRequestsResponseRfc9457()
  async listRecent(
    @Query() query: ListRecentTraceQueryDto,
  ): Promise<ApiResponse<RecentTraceBatchItemProjection[]>> {
    const items = await this.traceService.listRecentTraceBatches(query.limit);
    return apiSuccess(items);
  }

  @Get(FARMS_ROUTES.TRACE_BY_BATCH_CODE)
  @Public()
  @SkipThrottle({ default: true, auth: true })
  @Throttle({
    public: { limit: 300, ttl: 60000 },
  })
  @Header("Cache-Control", "no-cache")
  @ApiOperation({
    summary: "Get public batch QR traceability record",
    description:
      "Returns redacted provenance metadata, environmental lab telemetry, and chronological append-only cultivation logs for a batch code.",
  })
  @ApiParam({
    name: "batchCode",
    type: "string",
    description: "Batch traceability code (case-insensitive, trimmed)",
    example: "BATCH-2026-TOM-01",
  })
  @ApiOkResponseGeneric(TraceRecordDto)
  @ApiNotFoundResponseRfc9457()
  @ApiTooManyRequestsResponseRfc9457()
  async getByBatchCode(
    @Param("batchCode", new ZodValidationPipe(batchCodeParamSchema))
    batchCode: string,
  ): Promise<ApiResponse<TraceRecordProjection>> {
    const record = await this.traceService.getTraceByBatchCode(batchCode);
    return apiSuccess(record);
  }
}

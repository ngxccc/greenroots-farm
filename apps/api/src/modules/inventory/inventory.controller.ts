import { Controller, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@greenroots/shared";
import {
  ApiAuth,
  ApiBadRequestResponseRfc9457,
  ApiInternalServerErrorResponseRfc9457,
  ApiOkResponsePaginated,
  ApiUnprocessableEntityResponseRfc9457,
} from "@/common/decorators";
import type { PaginationMetaDto } from "@/common/dto/api-response.dto";
import { apiSuccess, type ApiResponse } from "@/common/utils/api-response.util";
import { BatchesService } from "./batches.service";
import {
  ListNearExpiryQueryDto,
  NearExpiryBatchDto,
  type NearExpiryBatchProjection,
} from "./dto";
import { INVENTORY_ROUTES } from "./inventory.routes";

/**
 * Inventory inspection endpoints (`/api/v1/inventory`).
 */
@ApiTags(INVENTORY_ROUTES.TAG)
@Controller({ path: INVENTORY_ROUTES.INVENTORY_BASE, version: "1" })
@ApiBadRequestResponseRfc9457()
@ApiInternalServerErrorResponseRfc9457()
export class InventoryController {
  constructor(private readonly batchesService: BatchesService) {}

  @Get(INVENTORY_ROUTES.INVENTORY_NEAR_EXPIRY)
  @ApiAuth(
    UserRole.FARM_STAFF,
    UserRole.SALES,
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  )
  @ApiOperation({
    summary: "List near-expiry inventory batches",
    description:
      "Returns a paginated FEFO-ordered list of live sellable batches expiring within the farm's flash-sale hours threshold, including computed rescue pricing.",
  })
  @ApiOkResponsePaginated(NearExpiryBatchDto)
  @ApiUnprocessableEntityResponseRfc9457()
  async listNearExpiry(
    @Query() query: ListNearExpiryQueryDto,
  ): Promise<ApiResponse<NearExpiryBatchProjection[], PaginationMetaDto>> {
    const { items, meta } =
      await this.batchesService.listNearExpiryBatches(query);
    return apiSuccess(items, meta);
  }
}

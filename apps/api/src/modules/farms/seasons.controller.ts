import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiNoContentResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
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
} from "@/common/decorators";
import type { PaginationMetaDto } from "@/common/dto/api-response.dto";
import { ZodValidationPipe } from "@/common/pipes/zod-validation.pipe";
import { zUuidV7 } from "@/common/schemas/zod-primitives";
import { apiSuccess, type ApiResponse } from "@/common/utils/api-response.util";
import {
  CreateSeasonDto,
  ListSeasonsQueryDto,
  SeasonDto,
  UpdateSeasonDto,
  type SeasonProjection,
} from "./dto";
import { FARMS_ROUTES } from "./farms.routes";
import { SeasonsService } from "./seasons.service";

/**
 * Cultivation seasons lifecycle endpoints (`/api/v1/seasons`).
 */
@ApiTags(FARMS_ROUTES.TAG)
@Controller({ path: FARMS_ROUTES.SEASONS_BASE, version: "1" })
@ApiBadRequestResponseRfc9457()
@ApiInternalServerErrorResponseRfc9457()
export class SeasonsController {
  constructor(private readonly seasonsService: SeasonsService) {}

  @Get()
  @ApiAuth(UserRole.FARM_STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "List cultivation seasons",
    description:
      "Returns a paginated list of cultivation seasons with status/plot filtering, search, and nested plot summary.",
  })
  @ApiOkResponsePaginated(SeasonDto)
  async list(
    @Query() query: ListSeasonsQueryDto,
  ): Promise<ApiResponse<SeasonProjection[], PaginationMetaDto>> {
    const { items, meta } = await this.seasonsService.listSeasons(query);
    return apiSuccess(items, meta);
  }

  @Get(FARMS_ROUTES.SEASON_BY_ID)
  @ApiAuth(UserRole.FARM_STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "Get a cultivation season by ID",
    description:
      "Returns a single cultivation season with its linked plot summary, preserving plot metadata for historical seasons.",
  })
  @ApiParam({
    name: "id",
    type: "string",
    format: "uuid",
    description: "Season UUIDv7 identifier",
  })
  @ApiOkResponseGeneric(SeasonDto)
  @ApiNotFoundResponseRfc9457()
  async getById(
    @Param("id", new ZodValidationPipe(zUuidV7())) id: string,
  ): Promise<ApiResponse<SeasonProjection>> {
    const season = await this.seasonsService.getSeasonById(id);
    return apiSuccess(season);
  }

  @Post()
  @ApiAuth(UserRole.FARM_STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "Create a cultivation season",
    description:
      "Creates a new season in planning status linked to a live plot with startDate <= expectedHarvestDate.",
  })
  @ApiCreatedResponseGeneric(SeasonDto)
  @ApiNotFoundResponseRfc9457()
  async create(
    @Body() dto: CreateSeasonDto,
  ): Promise<ApiResponse<SeasonProjection>> {
    const created = await this.seasonsService.createSeason(dto);
    return apiSuccess(created);
  }

  @Patch(FARMS_ROUTES.SEASON_BY_ID)
  @ApiAuth(UserRole.FARM_STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "Update or transition a cultivation season",
    description:
      "Updates phase-permitted fields or advances the linear lifecycle status (planning -> active -> harvested -> completed).",
  })
  @ApiParam({
    name: "id",
    type: "string",
    format: "uuid",
    description: "Season UUIDv7 identifier",
  })
  @ApiOkResponseGeneric(SeasonDto)
  @ApiNotFoundResponseRfc9457()
  @ApiConflictResponseRfc9457()
  @ApiUnprocessableEntityResponseRfc9457()
  async update(
    @Param("id", new ZodValidationPipe(zUuidV7())) id: string,
    @Body() dto: UpdateSeasonDto,
  ): Promise<ApiResponse<SeasonProjection>> {
    const updated = await this.seasonsService.updateSeason(id, dto);
    return apiSuccess(updated);
  }

  @Delete(FARMS_ROUTES.SEASON_BY_ID)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuth(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "Delete a planning cultivation season",
    description:
      "Hard-deletes a planning season only when no batches or farming logs reference it.",
  })
  @ApiParam({
    name: "id",
    type: "string",
    format: "uuid",
    description: "Season UUIDv7 identifier",
  })
  @ApiNoContentResponse({ description: "Season deleted successfully" })
  @ApiNotFoundResponseRfc9457()
  @ApiConflictResponseRfc9457()
  async remove(
    @Param("id", new ZodValidationPipe(zUuidV7())) id: string,
  ): Promise<void> {
    await this.seasonsService.deleteSeason(id);
  }
}

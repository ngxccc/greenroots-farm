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
import { STAFF_ROLES, UserRole } from "@greenroots/shared";
import {
  ApiAuth,
  ApiBadRequestResponseRfc9457,
  ApiConflictResponseRfc9457,
  ApiCreatedResponseGeneric,
  ApiInternalServerErrorResponseRfc9457,
  ApiNotFoundResponseRfc9457,
  ApiOkResponseGeneric,
  ApiOkResponsePaginated,
} from "@/common/decorators";
import type { PaginationMetaDto } from "@/common/dto/api-response.dto";
import { ZodValidationPipe } from "@/common/pipes/zod-validation.pipe";
import { zUuidV7 } from "@/common/schemas/zod-primitives";
import { apiSuccess, type ApiResponse } from "@/common/utils/api-response.util";
import {
  CreatePlotDto,
  ListPlotsQueryDto,
  PlotDto,
  UpdatePlotDto,
  type PlotProjection,
} from "./dto";
import { FARMS_ROUTES } from "./farms.routes";
import { PlotsService } from "./plots.service";

/**
 * Cultivation plots CRUD endpoints (`/api/v1/plots`).
 */
@ApiTags(FARMS_ROUTES.TAG)
@Controller({ path: FARMS_ROUTES.PLOTS_BASE, version: "1" })
@ApiBadRequestResponseRfc9457()
@ApiInternalServerErrorResponseRfc9457()
export class PlotsController {
  constructor(private readonly plotsService: PlotsService) {}

  @Get()
  @ApiAuth(...STAFF_ROLES)
  @ApiOperation({
    summary: "List active cultivation plots",
    description:
      "Returns a paginated list of non-deleted farm plots with search and sorting.",
  })
  @ApiOkResponsePaginated(PlotDto)
  async list(
    @Query() query: ListPlotsQueryDto,
  ): Promise<ApiResponse<PlotProjection[], PaginationMetaDto>> {
    const { items, meta } = await this.plotsService.listPlots(query);
    return apiSuccess(items, meta);
  }

  @Get(FARMS_ROUTES.PLOT_BY_ID)
  @ApiAuth(...STAFF_ROLES)
  @ApiOperation({
    summary: "Get a cultivation plot by ID",
    description:
      "Returns a single non-deleted plot including structured soil and water test results.",
  })
  @ApiParam({
    name: "id",
    type: "string",
    format: "uuid",
    description: "Plot UUIDv7 identifier",
  })
  @ApiOkResponseGeneric(PlotDto)
  @ApiNotFoundResponseRfc9457()
  async getById(
    @Param("id", new ZodValidationPipe(zUuidV7())) id: string,
  ): Promise<ApiResponse<PlotProjection>> {
    const plot = await this.plotsService.getPlotById(id);
    return apiSuccess(plot);
  }

  @Post()
  @ApiAuth(UserRole.FARM_STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "Create a cultivation plot",
    description:
      "Creates a new plot under the singleton farm with unique active plotCode, positive areaSqm, and optional soil/water test telemetry.",
  })
  @ApiCreatedResponseGeneric(PlotDto)
  @ApiNotFoundResponseRfc9457()
  @ApiConflictResponseRfc9457()
  async create(
    @Body() dto: CreatePlotDto,
  ): Promise<ApiResponse<PlotProjection>> {
    const created = await this.plotsService.createPlot(dto);
    return apiSuccess(created);
  }

  @Patch(FARMS_ROUTES.PLOT_BY_ID)
  @ApiAuth(UserRole.FARM_STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "Update a cultivation plot",
    description:
      "Updates fields on a live plot or clears soil/water test telemetry when passed null.",
  })
  @ApiParam({
    name: "id",
    type: "string",
    format: "uuid",
    description: "Plot UUIDv7 identifier",
  })
  @ApiOkResponseGeneric(PlotDto)
  @ApiNotFoundResponseRfc9457()
  @ApiConflictResponseRfc9457()
  async update(
    @Param("id", new ZodValidationPipe(zUuidV7())) id: string,
    @Body() dto: UpdatePlotDto,
  ): Promise<ApiResponse<PlotProjection>> {
    const updated = await this.plotsService.updatePlot(id, dto);
    return apiSuccess(updated);
  }

  @Delete(FARMS_ROUTES.PLOT_BY_ID)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuth(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "Soft-delete a cultivation plot",
    description:
      "Soft-deletes a plot when no planning or active season references it.",
  })
  @ApiParam({
    name: "id",
    type: "string",
    format: "uuid",
    description: "Plot UUIDv7 identifier",
  })
  @ApiNoContentResponse({ description: "Plot soft-deleted successfully" })
  @ApiNotFoundResponseRfc9457()
  @ApiConflictResponseRfc9457()
  async remove(
    @Param("id", new ZodValidationPipe(zUuidV7())) id: string,
  ): Promise<void> {
    await this.plotsService.deletePlot(id);
  }
}

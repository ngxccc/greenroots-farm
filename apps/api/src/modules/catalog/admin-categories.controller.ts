import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@greenroots/shared";
import {
  ApiAuth,
  ApiBadRequestResponseRfc9457,
  ApiInternalServerErrorResponseRfc9457,
  ApiNotFoundResponseRfc9457,
  ApiOkResponseGeneric,
  ApiOkResponsePaginated,
} from "@/common/decorators";
import type { PaginationMetaDto } from "@/common/dto/api-response.dto";
import { ZodValidationPipe } from "@/common/pipes/zod-validation.pipe";
import { zUuidV7 } from "@/common/schemas/zod-primitives";
import { apiSuccess, type ApiResponse } from "@/common/utils/api-response.util";
import { CATALOG_ROUTES } from "./catalog.routes";
import { CategoriesService } from "./categories.service";
import {
  AdminListCategoriesQueryDto,
  CategoryDto,
  type CategoryProjection,
} from "./dto";

/**
 * Backoffice category read endpoints (`/api/v1/admin/categories`) exposing inactive items.
 */
@ApiTags(CATALOG_ROUTES.TAG)
@Controller({ path: CATALOG_ROUTES.ADMIN_CATEGORIES_BASE, version: "1" })
@ApiBadRequestResponseRfc9457()
@ApiInternalServerErrorResponseRfc9457()
export class AdminCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiAuth(UserRole.SALES, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "List catalog categories for backoffice",
    description:
      "Returns a paginated list of non-deleted categories including inactive entries for sales and admin operations.",
  })
  @ApiOkResponsePaginated(CategoryDto)
  async list(
    @Query() query: AdminListCategoriesQueryDto,
  ): Promise<ApiResponse<CategoryProjection[], PaginationMetaDto>> {
    const { items, meta } = await this.categoriesService.listCategories(query, {
      includeInactive: true,
    });
    return apiSuccess(items, meta);
  }

  @Get(CATALOG_ROUTES.CATEGORY_BY_ID)
  @ApiAuth(UserRole.SALES, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "Get a catalog category by ID for backoffice",
    description:
      "Returns any non-deleted category by UUIDv7, including inactive categories.",
  })
  @ApiParam({
    name: "id",
    type: "string",
    format: "uuid",
    description: "Category UUIDv7 identifier",
  })
  @ApiOkResponseGeneric(CategoryDto)
  @ApiNotFoundResponseRfc9457()
  async getById(
    @Param("id", new ZodValidationPipe(zUuidV7())) id: string,
  ): Promise<ApiResponse<CategoryProjection>> {
    const category = await this.categoriesService.getAdminCategoryById(id);
    return apiSuccess(category);
  }
}

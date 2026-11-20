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
import { SkipThrottle, Throttle } from "@nestjs/throttler";
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
  ApiTooManyRequestsResponseRfc9457,
  ApiUnprocessableEntityResponseRfc9457,
  Public,
} from "@/common/decorators";
import type { PaginationMetaDto } from "@/common/dto/api-response.dto";
import { ZodValidationPipe } from "@/common/pipes/zod-validation.pipe";
import { zUuidV7 } from "@/common/schemas/zod-primitives";
import { apiSuccess, type ApiResponse } from "@/common/utils/api-response.util";
import { CATALOG_ROUTES } from "./catalog.routes";
import { CategoriesService } from "./categories.service";
import {
  CategoryDto,
  CreateCategoryDto,
  ListCategoriesQueryDto,
  UpdateCategoryDto,
  type CategoryProjection,
} from "./dto";

/**
 * Public category read and staff category mutation endpoints (`/api/v1/categories`).
 */
@ApiTags(CATALOG_ROUTES.TAG)
@Controller({ path: CATALOG_ROUTES.CATEGORIES_BASE, version: "1" })
@ApiBadRequestResponseRfc9457()
@ApiInternalServerErrorResponseRfc9457()
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @Public()
  @SkipThrottle({ default: true, auth: true })
  @Throttle({
    public: { limit: 300, ttl: 60000 },
  })
  @ApiOperation({
    summary: "List active catalog categories",
    description:
      "Returns a paginated flat list of active, non-deleted categories with search, parent filtering, and sorting.",
  })
  @ApiOkResponsePaginated(CategoryDto)
  @ApiTooManyRequestsResponseRfc9457()
  async list(
    @Query() query: ListCategoriesQueryDto,
  ): Promise<ApiResponse<CategoryProjection[], PaginationMetaDto>> {
    const { items, meta } = await this.categoriesService.listCategories(query, {
      includeInactive: false,
    });
    return apiSuccess(items, meta);
  }

  @Post()
  @ApiAuth(UserRole.SALES, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "Create a catalog category",
    description:
      "Creates a category with an active-unique kebab-case slug and up to two hierarchy levels.",
  })
  @ApiCreatedResponseGeneric(CategoryDto)
  @ApiNotFoundResponseRfc9457()
  @ApiConflictResponseRfc9457()
  @ApiUnprocessableEntityResponseRfc9457()
  async create(
    @Body() dto: CreateCategoryDto,
  ): Promise<ApiResponse<CategoryProjection>> {
    const created = await this.categoriesService.createCategory(dto);
    return apiSuccess(created);
  }

  @Patch(CATALOG_ROUTES.CATEGORY_BY_ID)
  @ApiAuth(UserRole.SALES, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "Update a catalog category",
    description:
      "Partially updates a non-deleted category while preserving two-level hierarchy and slug uniqueness.",
  })
  @ApiParam({
    name: "id",
    type: "string",
    format: "uuid",
    description: "Category UUIDv7 identifier",
  })
  @ApiOkResponseGeneric(CategoryDto)
  @ApiNotFoundResponseRfc9457()
  @ApiConflictResponseRfc9457()
  @ApiUnprocessableEntityResponseRfc9457()
  async update(
    @Param("id", new ZodValidationPipe(zUuidV7())) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<ApiResponse<CategoryProjection>> {
    const updated = await this.categoriesService.updateCategory(id, dto);
    return apiSuccess(updated);
  }

  @Delete(CATALOG_ROUTES.CATEGORY_BY_ID)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuth(UserRole.SALES, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "Soft-delete a catalog category",
    description:
      "Soft-deletes a category when no non-deleted child categories or products depend on it, freeing its slug and name.",
  })
  @ApiParam({
    name: "id",
    type: "string",
    format: "uuid",
    description: "Category UUIDv7 identifier",
  })
  @ApiNoContentResponse({ description: "Category soft-deleted successfully" })
  @ApiNotFoundResponseRfc9457()
  @ApiConflictResponseRfc9457()
  async remove(
    @Param("id", new ZodValidationPipe(zUuidV7())) id: string,
  ): Promise<void> {
    await this.categoriesService.deleteCategory(id);
  }
}

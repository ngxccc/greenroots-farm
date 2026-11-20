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
import {
  AdminListProductsQueryDto,
  ProductDto,
  type ProductProjection,
} from "./dto";
import { ProductsService } from "./products.service";

/**
 * Backoffice product read endpoints (`/api/v1/admin/products`) exposing inactive SKUs.
 */
@ApiTags(CATALOG_ROUTES.TAG)
@Controller({ path: CATALOG_ROUTES.ADMIN_PRODUCTS_BASE, version: "1" })
@ApiBadRequestResponseRfc9457()
@ApiInternalServerErrorResponseRfc9457()
export class AdminProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiAuth(UserRole.SALES, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "List catalog products for backoffice",
    description:
      "Returns a paginated list of non-deleted products including inactive items and items under inactive categories.",
  })
  @ApiOkResponsePaginated(ProductDto)
  async list(
    @Query() query: AdminListProductsQueryDto,
  ): Promise<ApiResponse<ProductProjection[], PaginationMetaDto>> {
    const { items, meta } = await this.productsService.listProducts(query, {
      includeInactive: true,
    });
    return apiSuccess(items, meta);
  }

  @Get(CATALOG_ROUTES.PRODUCT_BY_ID)
  @ApiAuth(UserRole.SALES, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "Get a catalog product by ID for backoffice",
    description:
      "Returns any non-deleted product by UUIDv7, including inactive products.",
  })
  @ApiParam({
    name: "id",
    type: "string",
    format: "uuid",
    description: "Product UUIDv7 identifier",
  })
  @ApiOkResponseGeneric(ProductDto)
  @ApiNotFoundResponseRfc9457()
  async getById(
    @Param("id", new ZodValidationPipe(zUuidV7())) id: string,
  ): Promise<ApiResponse<ProductProjection>> {
    const product = await this.productsService.getAdminProductById(id);
    return apiSuccess(product);
  }
}

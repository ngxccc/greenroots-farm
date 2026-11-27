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
import { Throttle } from "@nestjs/throttler";
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
import {
  CreateProductDto,
  ListProductsQueryDto,
  ProductDetailDto,
  ProductDto,
  UpdateProductDto,
  zCatalogSlug,
  type ProductDetailProjection,
  type ProductProjection,
} from "./dto";
import { ProductsService } from "./products.service";

/**
 * Public product catalog read and staff product mutation endpoints (`/api/v1/products`).
 */
@ApiTags(CATALOG_ROUTES.TAG)
@Controller({ path: CATALOG_ROUTES.PRODUCTS_BASE, version: "1" })
@ApiBadRequestResponseRfc9457()
@ApiInternalServerErrorResponseRfc9457()
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @Public()
  @Throttle({
    default: { limit: 300, ttl: 60000 },
  })
  @ApiOperation({
    summary: "List active catalog products",
    description:
      "Returns a paginated list of active, non-deleted products in active categories with VietGAP/USDA, effective-price, and two-level category filtering.",
  })
  @ApiOkResponsePaginated(ProductDto)
  @ApiTooManyRequestsResponseRfc9457()
  async list(
    @Query() query: ListProductsQueryDto,
  ): Promise<ApiResponse<ProductProjection[], PaginationMetaDto>> {
    const { items, meta } = await this.productsService.listProducts(query, {
      includeInactive: false,
    });
    return apiSuccess(items, meta);
  }

  @Get(CATALOG_ROUTES.PRODUCT_BY_SLUG)
  @Public()
  @Throttle({
    default: { limit: 300, ttl: 60000 },
  })
  @ApiOperation({
    summary: "Get an active catalog product by slug",
    description:
      "Returns a single active, non-deleted product belonging to an active category by kebab-case slug.",
  })
  @ApiParam({
    name: "slug",
    type: "string",
    description: "Product kebab-case slug",
    example: "ca-chua-bi-huu-co",
  })
  @ApiOkResponseGeneric(ProductDetailDto)
  @ApiNotFoundResponseRfc9457()
  @ApiTooManyRequestsResponseRfc9457()
  async getBySlug(
    @Param("slug", new ZodValidationPipe(zCatalogSlug())) slug: string,
  ): Promise<ApiResponse<ProductDetailProjection>> {
    const product = await this.productsService.getPublicProductBySlug(slug);
    return apiSuccess(product);
  }

  @Post()
  @ApiAuth(UserRole.SALES, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "Create a catalog product",
    description:
      "Creates a product under a live category with integer VND prices, optional markdown price, certifications, and Cloudinary product image URLs.",
  })
  @ApiCreatedResponseGeneric(ProductDto)
  @ApiNotFoundResponseRfc9457()
  @ApiConflictResponseRfc9457()
  async create(
    @Body() dto: CreateProductDto,
  ): Promise<ApiResponse<ProductProjection>> {
    const created = await this.productsService.createProduct(dto);
    return apiSuccess(created);
  }

  @Patch(CATALOG_ROUTES.PRODUCT_BY_ID)
  @ApiAuth(UserRole.SALES, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "Update a catalog product",
    description:
      "Partially updates a non-deleted product while enforcing salePriceVnd <= basePriceVnd against persisted values.",
  })
  @ApiParam({
    name: "id",
    type: "string",
    format: "uuid",
    description: "Product UUIDv7 identifier",
  })
  @ApiOkResponseGeneric(ProductDto)
  @ApiNotFoundResponseRfc9457()
  @ApiConflictResponseRfc9457()
  @ApiUnprocessableEntityResponseRfc9457()
  async update(
    @Param("id", new ZodValidationPipe(zUuidV7())) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ApiResponse<ProductProjection>> {
    const updated = await this.productsService.updateProduct(id, dto);
    return apiSuccess(updated);
  }

  @Delete(CATALOG_ROUTES.PRODUCT_BY_ID)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuth(UserRole.SALES, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "Soft-delete a catalog product",
    description:
      "Soft-deletes a product so its slug can be reused while preserving historical batch and order references.",
  })
  @ApiParam({
    name: "id",
    type: "string",
    format: "uuid",
    description: "Product UUIDv7 identifier",
  })
  @ApiNoContentResponse({ description: "Product soft-deleted successfully" })
  @ApiNotFoundResponseRfc9457()
  async remove(
    @Param("id", new ZodValidationPipe(zUuidV7())) id: string,
  ): Promise<void> {
    await this.productsService.deleteProduct(id);
  }
}

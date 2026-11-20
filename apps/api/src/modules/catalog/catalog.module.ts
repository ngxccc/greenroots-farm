import { Module } from "@nestjs/common";
import { AdminCategoriesController } from "./admin-categories.controller";
import { AdminProductsController } from "./admin-products.controller";
import { CategoriesController } from "./categories.controller";
import { CategoriesService } from "./categories.service";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";

/**
 * Catalog module hosting categories and products CRUD plus public/backoffice read boundaries.
 */
@Module({
  controllers: [
    CategoriesController,
    ProductsController,
    AdminCategoriesController,
    AdminProductsController,
  ],
  providers: [CategoriesService, ProductsService],
  exports: [CategoriesService, ProductsService],
})
export class CatalogModule {}

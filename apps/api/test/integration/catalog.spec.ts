import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import request from "supertest";
import { type INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { eq, sql } from "drizzle-orm";
import { API_ERROR_CODES, UserRole, WasteLogStatus } from "@greenroots/shared";
import { env } from "@/common/config/env.config";
import type { Rfc9457ProblemDetails } from "@/common/filters/global-exception.filter";
import type { ApiResponse } from "@/common/utils/api-response.util";
import { batches, categories, products, wasteLogs } from "@/database/schemas";
import { ProductsService } from "@/modules/catalog/products.service";
import {
  BatchMother,
  CategoryMother,
  createBatch,
  createCategory,
  createProduct,
  ProductMother,
} from "../factories";
import type { components } from "../generated/api-schema";
import {
  createTestApp,
  teardownTestApp,
  type TestAppSetup,
} from "../helpers/app.helper";
import {
  createAuthenticatedAdmin,
  createAuthenticatedUser,
} from "../helpers/auth.helper";

type CategorySchema = components["schemas"]["CategoryDto"];
type ProductSchema = components["schemas"]["ProductDto"];
type PaginationMetaSchema = components["schemas"]["PaginationMetaDto"];

function validProductImageUrl(name: string): string {
  return `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/image/upload/v1/products/${name}`;
}

describe("Catalog Integration", () => {
  let setup: TestAppSetup;
  let app: INestApplication;
  let jwtService: JwtService;

  let customerHeader: { Authorization: string };
  let farmStaffHeader: { Authorization: string };
  let farmStaffUserId: string;
  let salesHeader: { Authorization: string };
  let adminHeader: { Authorization: string };
  let superAdminHeader: { Authorization: string };

  beforeAll(async () => {
    setup = await createTestApp();
    app = setup.app;
    jwtService = app.get(JwtService);
  }, 30000);

  beforeEach(async () => {
    await setup.db.execute(
      sql`TRUNCATE TABLE "batches", "products", "categories", "seasons", "plots", "farms", "users" CASCADE;`,
    );

    const [
      customerSession,
      farmStaffSession,
      salesSession,
      adminSession,
      superAdminSession,
    ] = await Promise.all([
      createAuthenticatedUser(setup.db, jwtService, {
        role: UserRole.CUSTOMER,
      }),
      createAuthenticatedAdmin(setup.db, jwtService, UserRole.FARM_STAFF),
      createAuthenticatedAdmin(setup.db, jwtService, UserRole.SALES),
      createAuthenticatedAdmin(setup.db, jwtService, UserRole.ADMIN),
      createAuthenticatedAdmin(setup.db, jwtService, UserRole.SUPER_ADMIN),
    ]);

    customerHeader = customerSession.authHeader;
    farmStaffHeader = farmStaffSession.authHeader;
    farmStaffUserId = farmStaffSession.user.id;
    salesHeader = salesSession.authHeader;
    adminHeader = adminSession.authHeader;
    superAdminHeader = superAdminSession.authHeader;
  });

  afterAll(async () => {
    await teardownTestApp(setup);
  });

  describe("GET /api/v1/categories", () => {
    it("lists only active non-deleted categories with pagination and sorting", async () => {
      // Invariant: INV-CAT-1
      const c1 = await createCategory(
        setup.db,
        CategoryMother.root({
          name: "Rau ăn lá",
          slug: "rau-an-la",
          sortOrder: 2,
        }),
      );
      const c2 = await createCategory(
        setup.db,
        CategoryMother.root({
          name: "Rau củ quả",
          slug: "rau-cu-qua",
          sortOrder: 1,
        }),
      );
      await createCategory(
        setup.db,
        CategoryMother.inactive({
          name: "Danh mục ẩn",
          slug: "danh-muc-an",
          sortOrder: 0,
        }),
      );
      await createCategory(setup.db, {
        name: "Danh mục đã xóa",
        slug: "danh-muc-da-xoa",
        deletedAt: new Date(),
      });

      const res = await request(app.getHttpServer())
        .get("/api/v1/categories?page=1&limit=10")
        .expect(200);

      const body = res.body as ApiResponse<
        CategorySchema[],
        PaginationMetaSchema
      >;
      expect(body.success).toBe(true);
      expect(body.data.map((item) => item.id)).toEqual([c2.id, c1.id]);
      expect(body.meta?.total).toBe(2);
      expect("deletedAt" in (body.data[0] ?? {})).toBe(false);
    });

    it("filters rootOnly categories, parentId children, and escapes LIKE wildcards", async () => {
      const root = await createCategory(
        setup.db,
        CategoryMother.root({ name: "Rau củ 50%_test", slug: "rau-cu-50" }),
      );
      const child = await createCategory(
        setup.db,
        CategoryMother.child(root.id, { name: "Cà chua", slug: "ca-chua" }),
      );

      const rootRes = await request(app.getHttpServer())
        .get("/api/v1/categories?rootOnly=true&q=50%25_test")
        .expect(200);
      const rootBody = rootRes.body as ApiResponse<CategorySchema[]>;
      expect(rootBody.data.map((c) => c.id)).toEqual([root.id]);

      const childRes = await request(app.getHttpServer())
        .get(`/api/v1/categories?parentId=${root.id}`)
        .expect(200);
      const childBody = childRes.body as ApiResponse<CategorySchema[]>;
      expect(childBody.data.map((c) => c.id)).toEqual([child.id]);
    });

    it("rejects unknown query parameters and conflicting rootOnly + parentId filters", async () => {
      const unknownRes = await request(app.getHttpServer())
        .get("/api/v1/categories?unknownParam=1")
        .expect(400);
      const unknownBody = unknownRes.body as Rfc9457ProblemDetails;
      expect(unknownBody.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);

      const root = await createCategory(setup.db, CategoryMother.root());
      await request(app.getHttpServer())
        .get(`/api/v1/categories?parentId=${root.id}&rootOnly=true`)
        .expect(400);
    });
  });

  describe("GET /api/v1/admin/categories", () => {
    it("exposes inactive categories to sales, admin, and super_admin while blocking customer and farm_staff", async () => {
      const hidden = await createCategory(
        setup.db,
        CategoryMother.inactive({
          name: "Trái cây theo mùa",
          slug: "trai-cay-theo-mua",
        }),
      );

      await request(app.getHttpServer())
        .get("/api/v1/admin/categories")
        .expect(401);
      await request(app.getHttpServer())
        .get("/api/v1/admin/categories")
        .set(customerHeader)
        .expect(403);
      await request(app.getHttpServer())
        .get("/api/v1/admin/categories")
        .set(farmStaffHeader)
        .expect(403);

      for (const header of [salesHeader, adminHeader, superAdminHeader]) {
        const listRes = await request(app.getHttpServer())
          .get("/api/v1/admin/categories?isActive=false")
          .set(header)
          .expect(200);
        const listBody = listRes.body as ApiResponse<CategorySchema[]>;
        expect(listBody.data.map((c) => c.id)).toEqual([hidden.id]);
      }

      const detailRes = await request(app.getHttpServer())
        .get(`/api/v1/admin/categories/${hidden.id}`)
        .set(salesHeader)
        .expect(200);
      const detailBody = detailRes.body as ApiResponse<CategorySchema>;
      expect(detailBody.data.id).toBe(hidden.id);
      expect(detailBody.data.isActive).toBe(false);
    });
  });

  describe("POST / PATCH / DELETE /api/v1/categories", () => {
    it("enforces RBAC, kebab-case slug, two-level hierarchy, and soft-delete slug reuse", async () => {
      // Invariant: INV-CAT-2, INV-CAT-3, INV-CAT-4
      await request(app.getHttpServer())
        .post("/api/v1/categories")
        .set(customerHeader)
        .send({ name: "Rau", slug: "rau" })
        .expect(403);

      await request(app.getHttpServer())
        .post("/api/v1/categories")
        .set(farmStaffHeader)
        .send({ name: "Rau", slug: "rau" })
        .expect(403);

      await request(app.getHttpServer())
        .post("/api/v1/categories")
        .set(salesHeader)
        .send({ name: "Bad Slug", slug: "Bad_Slug" })
        .expect(400);

      const rootRes = await request(app.getHttpServer())
        .post("/api/v1/categories")
        .set(salesHeader)
        .send({ name: "Rau củ quả", slug: "rau-cu-qua", sortOrder: 1 })
        .expect(201);
      const rootId = (rootRes.body as ApiResponse<CategorySchema>).data.id;

      const childRes = await request(app.getHttpServer())
        .post("/api/v1/categories")
        .set(adminHeader)
        .send({
          name: "Cà chua",
          slug: "ca-chua",
          parentId: rootId,
          sortOrder: 1,
        })
        .expect(201);
      const childId = (childRes.body as ApiResponse<CategorySchema>).data.id;

      // Grandchild (depth 3) rejected
      const depthRes = await request(app.getHttpServer())
        .post("/api/v1/categories")
        .set(salesHeader)
        .send({ name: "Cà chua bi", slug: "ca-chua-bi", parentId: childId })
        .expect(422);
      expect((depthRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.CATEGORY_HIERARCHY_INVALID,
      );

      // Demoting root that already has child rejected
      const otherRoot = await createCategory(setup.db, CategoryMother.root());
      const demoteRes = await request(app.getHttpServer())
        .patch(`/api/v1/categories/${rootId}`)
        .set(salesHeader)
        .send({ parentId: otherRoot.id })
        .expect(422);
      expect((demoteRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.CATEGORY_HIERARCHY_INVALID,
      );

      // Cannot delete root while child exists
      const hasChildrenRes = await request(app.getHttpServer())
        .delete(`/api/v1/categories/${rootId}`)
        .set(salesHeader)
        .expect(409);
      expect((hasChildrenRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.CATEGORY_HAS_CHILDREN,
      );

      // Link product to child, then verify delete blocks until product is soft-deleted
      const prod = await createProduct(setup.db, { categoryId: childId });
      const hasProductsRes = await request(app.getHttpServer())
        .delete(`/api/v1/categories/${childId}`)
        .set(salesHeader)
        .expect(409);
      expect((hasProductsRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.CATEGORY_HAS_PRODUCTS,
      );

      await request(app.getHttpServer())
        .delete(`/api/v1/products/${prod.id}`)
        .set(salesHeader)
        .expect(204);

      await request(app.getHttpServer())
        .delete(`/api/v1/categories/${childId}`)
        .set(superAdminHeader)
        .expect(204);

      // Reuse deleted child's slug and name immediately
      await request(app.getHttpServer())
        .post("/api/v1/categories")
        .set(salesHeader)
        .send({ name: "Cà chua", slug: "ca-chua", parentId: rootId })
        .expect(201);
    });

    it("preserves slug when PATCH updates only category name", async () => {
      const cat = await createCategory(setup.db, {
        name: "Gia vị",
        slug: "gia-vi",
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/categories/${cat.id}`)
        .set(salesHeader)
        .send({ name: "Rau gia vị" })
        .expect(200);

      const body = res.body as ApiResponse<CategorySchema>;
      expect(body.data.name).toBe("Rau gia vị");
      expect(body.data.slug).toBe("gia-vi");
    });
  });

  describe("GET /api/v1/products and GET /api/v1/products/:slug", () => {
    it("filters by VietGAP, USDA, effective price range, two-level categoryId/categorySlug, and sort", async () => {
      // Invariant: INV-CAT-1, INV-PROD-1
      const rootCat = await createCategory(
        setup.db,
        CategoryMother.root({ name: "Rau củ quả", slug: "rau-cu-qua" }),
      );
      const childCat = await createCategory(
        setup.db,
        CategoryMother.child(rootCat.id, { name: "Cà chua", slug: "ca-chua" }),
      );
      const otherCat = await createCategory(
        setup.db,
        CategoryMother.root({ name: "Rau ăn lá", slug: "rau-an-la" }),
      );
      const inactiveCat = await createCategory(
        setup.db,
        CategoryMother.inactive({ name: "Ẩn", slug: "an" }),
      );

      const tomatoSale = await createProduct(
        setup.db,
        ProductMother.vietGapMarkdown({
          categoryId: childCat.id,
          name: "Cà chua bi",
          slug: "ca-chua-bi",
          basePrice: 45000,
          salePrice: 28000,
          isVietGap: true,
          isUsda: false,
        }),
      );
      const spinachUsda = await createProduct(
        setup.db,
        ProductMother.usdaOrganic({
          categoryId: otherCat.id,
          name: "Cải bó xôi",
          slug: "cai-bo-xoi",
          basePrice: 35000,
          salePrice: null,
          isVietGap: true,
          isUsda: true,
        }),
      );
      // Hidden product + product inside inactive category must never appear publicly
      await createProduct(
        setup.db,
        ProductMother.inactive({
          categoryId: rootCat.id,
          slug: "san-pham-an",
        }),
      );
      await createProduct(setup.db, {
        categoryId: inactiveCat.id,
        slug: "trong-danh-muc-an",
        isActive: true,
      });

      // Filter by root categoryId includes childCat's tomato
      const byRootIdRes = await request(app.getHttpServer())
        .get(`/api/v1/products?categoryId=${rootCat.id}`)
        .expect(200);
      expect(
        (byRootIdRes.body as ApiResponse<ProductSchema[]>).data.map(
          (p) => p.id,
        ),
      ).toEqual([tomatoSale.id]);

      // Filter by root categorySlug includes childCat's tomato
      const byRootSlugRes = await request(app.getHttpServer())
        .get("/api/v1/products?categorySlug=rau-cu-qua")
        .expect(200);
      expect(
        (byRootSlugRes.body as ApiResponse<ProductSchema[]>).data.map(
          (p) => p.id,
        ),
      ).toEqual([tomatoSale.id]);

      // Filter effective price <= 30000 matches tomatoSale (basePrice 45k, salePrice 28k)
      const priceRes = await request(app.getHttpServer())
        .get("/api/v1/products?minPriceVnd=20000&maxPriceVnd=30000")
        .expect(200);
      expect(
        (priceRes.body as ApiResponse<ProductSchema[]>).data.map((p) => p.id),
      ).toEqual([tomatoSale.id]);

      // Filter isUsda=true & sort=price:asc
      const usdaRes = await request(app.getHttpServer())
        .get("/api/v1/products?isVietGap=true&isUsda=true")
        .expect(200);
      expect(
        (usdaRes.body as ApiResponse<ProductSchema[]>).data.map((p) => p.id),
      ).toEqual([spinachUsda.id]);

      const sortedRes = await request(app.getHttpServer())
        .get("/api/v1/products?sort=price:asc")
        .expect(200);
      expect(
        (sortedRes.body as ApiResponse<ProductSchema[]>).data.map((p) => p.id),
      ).toEqual([tomatoSale.id, spinachUsda.id]);

      // Public slug lookup returns active product and hides inactive/inactive-category items
      const slugRes = await request(app.getHttpServer())
        .get("/api/v1/products/ca-chua-bi")
        .expect(200);
      expect((slugRes.body as ApiResponse<ProductSchema>).data.id).toBe(
        tomatoSale.id,
      );

      await request(app.getHttpServer())
        .get("/api/v1/products/san-pham-an")
        .expect(404);
      await request(app.getHttpServer())
        .get("/api/v1/products/trong-danh-muc-an")
        .expect(404);

      // Admin route still exposes active product under inactive category
      const adminVisibleRes = await request(app.getHttpServer())
        .get("/api/v1/admin/products?q=trong-danh-muc-an")
        .set(salesHeader)
        .expect(200);
      expect(
        (adminVisibleRes.body as ApiResponse<ProductSchema[]>).data.some(
          (p) => p.slug === "trong-danh-muc-an",
        ),
      ).toBe(false);

      const adminInactiveCatProdRes = await request(app.getHttpServer())
        .get("/api/v1/admin/products?isActive=true")
        .set(salesHeader)
        .expect(200);
      expect(
        (
          adminInactiveCatProdRes.body as ApiResponse<ProductSchema[]>
        ).data.some((p) => p.slug === "trong-danh-muc-an"),
      ).toBe(true);
    });

    it("rejects unknown query params, conflicting categoryId+categorySlug, and minPriceVnd > maxPriceVnd", async () => {
      const cat = await createCategory(setup.db, CategoryMother.root());

      await request(app.getHttpServer())
        .get("/api/v1/products?bogus=true")
        .expect(400);

      await request(app.getHttpServer())
        .get(`/api/v1/products?categoryId=${cat.id}&categorySlug=${cat.slug}`)
        .expect(400);

      await request(app.getHttpServer())
        .get("/api/v1/products?minPriceVnd=50000&maxPriceVnd=30000")
        .expect(400);
    });

    it("aggregates sellable in_stock and near_expiry batches while excluding expired, sold_out, pending waste, and hidden products", async () => {
      // Invariant: INV-PROD-3, INV-PROD-5
      const activeCat = await createCategory(setup.db, CategoryMother.root());
      const inactiveCat = await createCategory(
        setup.db,
        CategoryMother.inactive({ slug: "inactive-cat-stock" }),
      );
      const deletedCat = await createCategory(
        setup.db,
        CategoryMother.softDeleted({ slug: "deleted-cat-stock" }),
      );

      const tomato = await createProduct(
        setup.db,
        ProductMother.vietGapMarkdown({
          categoryId: activeCat.id,
          slug: "ca-chua-ton-kho",
        }),
      );
      const zeroBatchProduct = await createProduct(
        setup.db,
        ProductMother.usdaOrganic({
          categoryId: activeCat.id,
          slug: "cai-bo-xoi-khong-lo",
        }),
      );
      const onlyExpiredProduct = await createProduct(setup.db, {
        categoryId: activeCat.id,
        slug: "xa-lach-het-han",
      });
      const inactiveProduct = await createProduct(
        setup.db,
        ProductMother.inactive({
          categoryId: activeCat.id,
          slug: "cu-cai-tam-an",
        }),
      );
      const inactiveCategoryProduct = await createProduct(setup.db, {
        categoryId: inactiveCat.id,
        slug: "su-hao-danh-muc-an",
      });
      const softDeletedProduct = await createProduct(
        setup.db,
        ProductMother.softDeleted({
          categoryId: activeCat.id,
          slug: "ca-rot-da-xoa",
        }),
      );
      const deletedCategoryProduct = await createProduct(setup.db, {
        categoryId: deletedCat.id,
        slug: "bau-danh-muc-da-xoa",
      });

      const nowMs = Date.now();
      // Sellable: in_stock (12.50) + near_expiry (3.25) = 15.75
      const tomatoInStockBatch = await createBatch(
        setup.db,
        BatchMother.inStock({
          productId: tomato.id,
          initialQuantity: "20.00",
          availableQuantity: "12.50",
        }),
      );
      await createBatch(
        setup.db,
        BatchMother.nearExpiry({
          productId: tomato.id,
          initialQuantity: "10.00",
          availableQuantity: "3.25",
        }),
      );
      // Pending approval waste log must NOT deduct availableQuantity until approved (EDGE-6)
      await setup.db.insert(wasteLogs).values({
        batchId: tomatoInStockBatch.id,
        reportedBy: farmStaffUserId,
        discardedQuantity: "2.00",
        reason: "Dập nhẹ chờ duyệt",
        mediaUrls: [validProductImageUrl("waste-pending.webp")],
        status: WasteLogStatus.PENDING_APPROVAL,
      });
      // Excluded: sold_out, expired status, and pre-cron past-expirationDate batches
      await createBatch(
        setup.db,
        BatchMother.soldOut({
          productId: tomato.id,
          initialQuantity: "5.00",
        }),
      );
      await createBatch(
        setup.db,
        BatchMother.expired({
          productId: tomato.id,
          initialQuantity: "8.00",
          availableQuantity: "8.00",
        }),
      );
      await createBatch(
        setup.db,
        BatchMother.inStock({
          productId: tomato.id,
          initialQuantity: "6.00",
          availableQuantity: "6.00",
          harvestDate: new Date(nowMs - 48 * 60 * 60 * 1000),
          expirationDate: new Date(nowMs - 1000),
        }),
      );
      await createBatch(
        setup.db,
        BatchMother.nearExpiry({
          productId: tomato.id,
          initialQuantity: "4.00",
          availableQuantity: "4.00",
          harvestDate: new Date(nowMs - 48 * 60 * 60 * 1000),
          expirationDate: new Date(nowMs - 1000),
        }),
      );

      // Product with only expired batch remains readable with availableQuantity 0
      await createBatch(
        setup.db,
        BatchMother.expired({
          productId: onlyExpiredProduct.id,
          initialQuantity: "5.00",
          availableQuantity: "5.00",
        }),
      );

      // Live batches on inactive/soft-deleted products or categories remain hidden publicly (EDGE-7)
      await Promise.all([
        createBatch(
          setup.db,
          BatchMother.inStock({
            productId: inactiveProduct.id,
            initialQuantity: "5.00",
            availableQuantity: "5.00",
          }),
        ),
        createBatch(
          setup.db,
          BatchMother.inStock({
            productId: inactiveCategoryProduct.id,
            initialQuantity: "6.00",
            availableQuantity: "6.00",
          }),
        ),
        createBatch(
          setup.db,
          BatchMother.inStock({
            productId: softDeletedProduct.id,
            initialQuantity: "9.00",
            availableQuantity: "9.00",
          }),
        ),
        createBatch(
          setup.db,
          BatchMother.inStock({
            productId: deletedCategoryProduct.id,
            initialQuantity: "7.00",
            availableQuantity: "7.00",
          }),
        ),
      ]);

      const listRes = await request(app.getHttpServer())
        .get("/api/v1/products")
        .expect(200);
      const listItems = (listRes.body as ApiResponse<ProductSchema[]>).data;
      const bySlug = new Map(listItems.map((item) => [item.slug, item]));

      expect(bySlug.get(tomato.slug)?.availableQuantity).toBe(15.75);
      expect(bySlug.get(zeroBatchProduct.slug)?.availableQuantity).toBe(0);
      expect(bySlug.get(onlyExpiredProduct.slug)?.availableQuantity).toBe(0);
      expect(bySlug.has(inactiveProduct.slug)).toBe(false);
      expect(bySlug.has(inactiveCategoryProduct.slug)).toBe(false);
      expect(bySlug.has(softDeletedProduct.slug)).toBe(false);
      expect(bySlug.has(deletedCategoryProduct.slug)).toBe(false);

      const tomatoDetailRes = await request(app.getHttpServer())
        .get(`/api/v1/products/${tomato.slug}`)
        .expect(200);
      expect(
        (tomatoDetailRes.body as ApiResponse<ProductSchema>).data
          .availableQuantity,
      ).toBe(15.75);

      const zeroDetailRes = await request(app.getHttpServer())
        .get(`/api/v1/products/${zeroBatchProduct.slug}`)
        .expect(200);
      expect(
        (zeroDetailRes.body as ApiResponse<ProductSchema>).data
          .availableQuantity,
      ).toBe(0);

      await request(app.getHttpServer())
        .get(`/api/v1/products/${inactiveProduct.slug}`)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/v1/products/${inactiveCategoryProduct.slug}`)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/v1/products/${softDeletedProduct.slug}`)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/v1/products/${deletedCategoryProduct.slug}`)
        .expect(404);

      // Admin endpoints also exclude soft-deleted products/categories even with sellable batches
      const adminListRes = await request(app.getHttpServer())
        .get("/api/v1/admin/products")
        .set(salesHeader)
        .expect(200);
      const adminSlugs = new Set(
        (adminListRes.body as ApiResponse<ProductSchema[]>).data.map(
          (item) => item.slug,
        ),
      );
      expect(adminSlugs.has(softDeletedProduct.slug)).toBe(false);
      expect(adminSlugs.has(deletedCategoryProduct.slug)).toBe(false);

      await request(app.getHttpServer())
        .get(`/api/v1/admin/products/${softDeletedProduct.id}`)
        .set(salesHeader)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/v1/admin/products/${deletedCategoryProduct.id}`)
        .set(salesHeader)
        .expect(404);
    });

    it("excludes a batch whose expiration_date equals NOW() exactly", async () => {
      // Invariant: INV-PROD-3
      const cat = await createCategory(setup.db, CategoryMother.root());
      const product = await createProduct(setup.db, {
        categoryId: cat.id,
        slug: "ca-chua-dung-han-now",
      });

      await setup.db.transaction(async (tx) => {
        const boundaryBatch = await createBatch(
          tx,
          BatchMother.inStock({
            productId: product.id,
            initialQuantity: "10.00",
            availableQuantity: "10.00",
          }),
        );

        await tx
          .update(batches)
          .set({ expirationDate: sql`NOW()` })
          .where(eq(batches.id, boundaryBatch.id));

        const txService = new ProductsService(tx);
        const result = await txService.getPublicProductBySlug(product.slug);
        expect(result.availableQuantity).toBe(0);
      });
    });
  });

  describe("GET /api/v1/admin/products and mutations POST / PATCH / DELETE /api/v1/products", () => {
    it("creates, updates, enforces price and media invariants, and reuses slug after soft delete", async () => {
      // Invariant: INV-CAT-4, INV-PROD-1, INV-PROD-2
      const cat = await createCategory(setup.db, CategoryMother.root());

      // RBAC check
      await request(app.getHttpServer())
        .post("/api/v1/products")
        .set(customerHeader)
        .send({
          categoryId: cat.id,
          name: "Bí đỏ",
          slug: "bi-do",
          basePriceVnd: 30000,
        })
        .expect(403);

      // Negative price and salePrice > basePrice rejected
      await request(app.getHttpServer())
        .post("/api/v1/products")
        .set(salesHeader)
        .send({
          categoryId: cat.id,
          name: "Bí đỏ",
          slug: "bi-do",
          basePriceVnd: -100,
        })
        .expect(400);

      await request(app.getHttpServer())
        .post("/api/v1/products")
        .set(salesHeader)
        .send({
          categoryId: cat.id,
          name: "Bí đỏ",
          slug: "bi-do",
          basePriceVnd: 30000,
          salePriceVnd: 35000,
        })
        .expect(400);

      // Cross-folder or duplicate image URL rejected
      await request(app.getHttpServer())
        .post("/api/v1/products")
        .set(salesHeader)
        .send({
          categoryId: cat.id,
          name: "Bí đỏ",
          slug: "bi-do",
          basePriceVnd: 30000,
          imageUrls: [
            `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/image/upload/v1/farming_logs/a.png`,
          ],
        })
        .expect(400);

      const img = validProductImageUrl("bi-do.webp");
      await request(app.getHttpServer())
        .post("/api/v1/products")
        .set(salesHeader)
        .send({
          categoryId: cat.id,
          name: "Bí đỏ",
          slug: "bi-do",
          basePriceVnd: 30000,
          imageUrls: [img, img],
        })
        .expect(400);

      // Valid create with null imageUrls normalizes to [] and strips XSS
      const nullImgRes = await request(app.getHttpServer())
        .post("/api/v1/products")
        .set(salesHeader)
        .send({
          categoryId: cat.id,
          name: "<script>alert(1)</script>Rau cải xanh",
          slug: "rau-cai-xanh-xss",
          description: "<img src=x onerror=alert(1)>Tươi sạch",
          basePriceVnd: 25000,
          imageUrls: null,
        })
        .expect(201);
      const nullImgProduct = (nullImgRes.body as ApiResponse<ProductSchema>)
        .data;
      expect(nullImgProduct.imageUrls).toEqual([]);
      expect(nullImgProduct.name).toBe("Rau cải xanh");
      expect(nullImgProduct.description).toBe("Tươi sạch");

      // Path traversal in imageUrls rejected
      await request(app.getHttpServer())
        .post("/api/v1/products")
        .set(salesHeader)
        .send({
          categoryId: cat.id,
          name: "Rau muống",
          slug: "rau-muong-traversal",
          basePriceVnd: 20000,
          imageUrls: [
            `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/image/upload/v1/products/../farming_logs/a.png`,
          ],
        })
        .expect(400);

      // Valid create with imageUrls
      const createRes = await request(app.getHttpServer())
        .post("/api/v1/products")
        .set(salesHeader)
        .send({
          categoryId: cat.id,
          name: "Bí đỏ hồ lô",
          slug: "bi-do-ho-lo",
          basePriceVnd: 40000,
          salePriceVnd: 32000,
          isVietGap: true,
          isActive: false,
          imageUrls: [img],
        })
        .expect(201);
      const created = (createRes.body as ApiResponse<ProductSchema>).data;
      expect(created.salePriceVnd).toBe(32000);
      expect(created.imageUrls).toEqual([img]);
      expect(created.availableQuantity).toBe(0);

      // Admin reads inactive product by list & :id (while rejecting unauthorized roles)
      await request(app.getHttpServer())
        .get("/api/v1/admin/products")
        .expect(401);
      await request(app.getHttpServer())
        .get("/api/v1/admin/products")
        .set(customerHeader)
        .expect(403);
      await request(app.getHttpServer())
        .get(`/api/v1/admin/products/${created.id}`)
        .set(farmStaffHeader)
        .expect(403);

      const adminListRes = await request(app.getHttpServer())
        .get("/api/v1/admin/products?isActive=false")
        .set(salesHeader)
        .expect(200);
      expect(
        (adminListRes.body as ApiResponse<ProductSchema[]>).data.map(
          (p) => p.id,
        ),
      ).toEqual([created.id]);

      const adminDetailRes = await request(app.getHttpServer())
        .get(`/api/v1/admin/products/${created.id}`)
        .set(adminHeader)
        .expect(200);
      expect(
        (adminDetailRes.body as ApiResponse<ProductSchema>).data.slug,
      ).toBe("bi-do-ho-lo");

      // Partial PATCH raising salePrice above persisted basePrice -> 422 PRODUCT_PRICE_INVALID
      const badPatchRes = await request(app.getHttpServer())
        .patch(`/api/v1/products/${created.id}`)
        .set(salesHeader)
        .send({ salePriceVnd: 45000 })
        .expect(422);
      expect((badPatchRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.PRODUCT_PRICE_INVALID,
      );

      // Partial PATCH updating name keeps slug immutable & clears salePriceVnd
      const patchRes = await request(app.getHttpServer())
        .patch(`/api/v1/products/${created.id}`)
        .set(adminHeader)
        .send({ name: "Bí đỏ hữu cơ", salePriceVnd: null, isActive: true })
        .expect(200);
      const patched = (patchRes.body as ApiResponse<ProductSchema>).data;
      expect(patched.name).toBe("Bí đỏ hữu cơ");
      expect(patched.slug).toBe("bi-do-ho-lo");
      expect(patched.salePriceVnd).toBeNull();

      // Attach a batch to confirm soft-deleting product keeps historical batch FK intact
      await createBatch(setup.db, {
        productId: created.id,
        batchCode: "BATCH-BI-01",
      });

      await request(app.getHttpServer())
        .delete(`/api/v1/products/${created.id}`)
        .set(superAdminHeader)
        .expect(204);

      const [deletedRow] = await setup.db
        .select({ deletedAt: products.deletedAt })
        .from(products)
        .where(eq(products.id, created.id));
      expect(deletedRow?.deletedAt).not.toBeNull();

      // Reuse slug after soft delete
      await request(app.getHttpServer())
        .post("/api/v1/products")
        .set(salesHeader)
        .send({
          categoryId: cat.id,
          name: "Bí đỏ vụ mới",
          slug: "bi-do-ho-lo",
          basePriceVnd: 42000,
        })
        .expect(201);
    });

    it("exposes live availableQuantity on admin product reads and PATCH responses", async () => {
      // Invariant: INV-PROD-3
      const cat = await createCategory(setup.db, CategoryMother.root());
      const product = await createProduct(
        setup.db,
        ProductMother.inactive({
          categoryId: cat.id,
          slug: "bi-do-ton-kho-admin",
        }),
      );

      await createBatch(
        setup.db,
        BatchMother.inStock({
          productId: product.id,
          initialQuantity: "30.00",
          availableQuantity: "25.00",
        }),
      );
      await createBatch(
        setup.db,
        BatchMother.expired({
          productId: product.id,
          initialQuantity: "10.00",
          availableQuantity: "10.00",
        }),
      );

      const adminListRes = await request(app.getHttpServer())
        .get("/api/v1/admin/products?isActive=false")
        .set(salesHeader)
        .expect(200);
      const listMatch = (
        adminListRes.body as ApiResponse<ProductSchema[]>
      ).data.find((item) => item.id === product.id);
      expect(listMatch?.availableQuantity).toBe(25);

      const adminDetailRes = await request(app.getHttpServer())
        .get(`/api/v1/admin/products/${product.id}`)
        .set(adminHeader)
        .expect(200);
      expect(
        (adminDetailRes.body as ApiResponse<ProductSchema>).data
          .availableQuantity,
      ).toBe(25);

      const patchRes = await request(app.getHttpServer())
        .patch(`/api/v1/products/${product.id}`)
        .set(adminHeader)
        .send({ name: "Bí đỏ hữu cơ (cập nhật)" })
        .expect(200);
      expect(
        (patchRes.body as ApiResponse<ProductSchema>).data.availableQuantity,
      ).toBe(25);
    });
  });

  describe("Concurrency invariants", () => {
    it("serializes concurrent category re-parenting without deadlocks and prevents two-node cycles", async () => {
      // Invariant: INV-CAT-2
      const catA = await createCategory(setup.db, CategoryMother.root());
      const catB = await createCategory(setup.db, CategoryMother.root());

      const [resA, resB] = await Promise.all([
        request(app.getHttpServer())
          .patch(`/api/v1/categories/${catA.id}`)
          .set(salesHeader)
          .send({ parentId: catB.id }),
        request(app.getHttpServer())
          .patch(`/api/v1/categories/${catB.id}`)
          .set(salesHeader)
          .send({ parentId: catA.id }),
      ]);

      const statuses = [resA.status, resB.status].sort((a, b) => a - b);
      expect(statuses).toEqual([200, 422]);

      const [rowA] = await setup.db
        .select({ parentId: categories.parentId })
        .from(categories)
        .where(eq(categories.id, catA.id));
      const [rowB] = await setup.db
        .select({ parentId: categories.parentId })
        .from(categories)
        .where(eq(categories.id, catB.id));
      expect(rowA?.parentId === null || rowB?.parentId === null).toBe(true);
    });

    it("serializes concurrent category soft-delete against product creation on the same category", async () => {
      // Invariant: INV-CAT-3
      const cat = await createCategory(setup.db, CategoryMother.root());

      const [delRes, prodRes] = await Promise.all([
        request(app.getHttpServer())
          .delete(`/api/v1/categories/${cat.id}`)
          .set(salesHeader),
        request(app.getHttpServer())
          .post("/api/v1/products")
          .set(salesHeader)
          .send({
            categoryId: cat.id,
            name: "Cải ngọt",
            slug: "cai-ngot-concurrent",
            basePriceVnd: 25000,
          }),
      ]);

      const outcomes = `${delRes.status}:${prodRes.status}`;
      expect(["204:404", "409:201"]).toContain(outcomes);
    });

    it("rejects duplicate concurrent product creation on identical active slug", async () => {
      // Invariant: INV-CAT-4
      const cat = await createCategory(setup.db, CategoryMother.root());

      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post("/api/v1/products")
          .set(salesHeader)
          .send({
            categoryId: cat.id,
            name: "Cải thìa 1",
            slug: "cai-thia-race",
            basePriceVnd: 20000,
          }),
        request(app.getHttpServer())
          .post("/api/v1/products")
          .set(salesHeader)
          .send({
            categoryId: cat.id,
            name: "Cải thìa 2",
            slug: "cai-thia-race",
            basePriceVnd: 22000,
          }),
      ]);

      expect([res1.status, res2.status].sort((a, b) => a - b)).toEqual([
        201, 409,
      ]);
    });

    it("serializes concurrent price updates so effective salePrice never exceeds basePrice", async () => {
      // Invariant: INV-PROD-1
      const prod = await createProduct(setup.db, {
        basePrice: 50000,
        salePrice: 30000,
      });

      const [raiseSale, lowerBase] = await Promise.all([
        request(app.getHttpServer())
          .patch(`/api/v1/products/${prod.id}`)
          .set(salesHeader)
          .send({ salePriceVnd: 45000 }),
        request(app.getHttpServer())
          .patch(`/api/v1/products/${prod.id}`)
          .set(salesHeader)
          .send({ basePriceVnd: 35000 }),
      ]);

      expect(
        [raiseSale.status, lowerBase.status].sort((a, b) => a - b),
      ).toEqual([200, 422]);

      const [finalRow] = await setup.db
        .select({
          basePrice: products.basePrice,
          salePrice: products.salePrice,
        })
        .from(products)
        .where(eq(products.id, prod.id));
      expect(
        finalRow?.salePrice === null ||
          (finalRow !== undefined && finalRow.salePrice <= finalRow.basePrice),
      ).toBe(true);
    });
  });
});

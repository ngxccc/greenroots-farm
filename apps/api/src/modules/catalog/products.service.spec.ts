import { beforeEach, describe, expect, it } from "bun:test";
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { API_ERROR_CODES, BatchStatus } from "@greenroots/shared";
import { PG_ERROR_CODE } from "@/common/constants/error.constant";
import { MESSAGES } from "@/common/constants/messages.constant";
import { createMockDb } from "../../../test/mocks/mock-database";
import { ProductsService } from "./products.service";

type MockDb = ReturnType<typeof createMockDb> & {
  setSelectResultsQueue: (results: unknown[][]) => void;
  mockInsertValues: { mockImplementationOnce: (fn: () => unknown) => void };
};

describe("ProductsService", () => {
  const categoryId = "019fa8bc-8f4d-7000-b366-e691f45cfb10";
  const productId = "019fa8bc-8f4d-7000-b366-e691f45cfb20";
  const timestamp = new Date("2026-11-20T00:00:00.000Z");

  const sampleCategorySummary = {
    id: categoryId,
    name: "Cà chua",
    slug: "ca-chua",
    parentId: null,
  };

  const sampleProductRow = {
    id: productId,
    categoryId,
    name: "Cà chua bi hữu cơ",
    slug: "ca-chua-bi-huu-co",
    description: "Cà chua bi VietGAP",
    storageInstructions: "Bảo quản ngăn mát 4-8°C",
    basePrice: 45000,
    salePrice: 36000,
    unit: "kg",
    imageUrls: null,
    isVietGap: true,
    isUsda: false,
    isSubscriptionEligible: true,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  let service: ProductsService;
  let mockDb: MockDb;

  beforeEach(() => {
    mockDb = createMockDb() as unknown as MockDb;
    service = new ProductsService(mockDb);
  });

  describe("listProducts", () => {
    it("returns empty pagination immediately when filter categorySlug does not resolve", async () => {
      mockDb.setSelectResultsQueue([[]]);

      const result = await service.listProducts(
        {
          categorySlug: "khong-ton-tai",
          page: 1,
          limit: 20,
          sort: "createdAt:desc",
        },
        { includeInactive: false },
      );

      expect(result.items).toEqual([]);
      expect(result.meta.total).toBe(0);
      expect(result.meta.totalPages).toBe(1);
    });

    it("normalizes null imageUrls to an empty array and maps integer Vnd price suffixes", async () => {
      mockDb.setSelectResultsQueue([
        [{ total: 1 }],
        [
          {
            product: sampleProductRow,
            category: sampleCategorySummary,
            availableQuantity: "15.50",
          },
        ],
      ]);

      const result = await service.listProducts(
        {
          page: 1,
          limit: 20,
          sort: "price:asc",
        },
        { includeInactive: false },
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.basePriceVnd).toBe(45000);
      expect(result.items[0]?.salePriceVnd).toBe(36000);
      expect(result.items[0]?.availableQuantity).toBe(15.5);
      expect(result.items[0]?.imageUrls).toEqual([]);
      expect(result.items[0]?.storageInstructions).toBe(
        "Bảo quản ngăn mát 4-8°C",
      );
    });

    it("maps null storageInstructions when absent on product row", async () => {
      mockDb.setSelectResultsQueue([
        [{ total: 1 }],
        [
          {
            product: { ...sampleProductRow, storageInstructions: null },
            category: sampleCategorySummary,
            availableQuantity: "5.00",
          },
        ],
      ]);

      const result = await service.listProducts(
        {
          page: 1,
          limit: 20,
          sort: "createdAt:desc",
        },
        { includeInactive: false },
      );

      expect(result.items[0]?.storageInstructions).toBeNull();
    });

    it("maps zero string availableQuantity values to 0", async () => {
      // Invariant: INV-PROD-3
      mockDb.setSelectResultsQueue([
        [{ total: 1 }],
        [
          {
            product: sampleProductRow,
            category: sampleCategorySummary,
            availableQuantity: "0",
          },
        ],
      ]);

      const result = await service.listProducts(
        {
          page: 1,
          limit: 20,
          sort: "createdAt:desc",
        },
        { includeInactive: false },
      );

      expect(result.items[0]?.availableQuantity).toBe(0);
    });
  });

  describe("getPublicProductBySlug", () => {
    it("maps aggregated availableQuantity decimal string and returns null trace when no sellable batch exists", async () => {
      // Invariant: INV-PROD-3, INV-PROD-6
      mockDb.setSelectResultsQueue([
        [
          {
            product: sampleProductRow,
            category: sampleCategorySummary,
            availableQuantity: "12.25",
          },
        ],
        [],
      ]);

      const result = await service.getPublicProductBySlug("ca-chua-bi-huu-co");

      expect(result.availableQuantity).toBe(12.25);
      expect(result.activeBatchTrace).toBeNull();
      expect(result.rescueProgress).toBeNull();
    });

    it("maps activeBatchTrace and omits rescueProgress when active FEFO batch is in_stock", async () => {
      // Invariant: INV-PROD-6, INV-PROD-7
      const harvestDate = new Date("2026-11-25T06:00:00.000Z");
      const expirationDate = new Date("2026-11-30T06:00:00.000Z");

      mockDb.setSelectResultsQueue([
        [
          {
            product: sampleProductRow,
            category: sampleCategorySummary,
            availableQuantity: "10.00",
          },
        ],
        [
          {
            batchCode: "LOT-2026-001",
            harvestDate,
            expirationDate,
            status: BatchStatus.IN_STOCK,
            initialQuantity: "20.00",
            availableQuantity: "10.00",
            plotCode: "PLOT-A1",
            plotName: "Nhà kính A1",
          },
        ],
      ]);

      const result = await service.getPublicProductBySlug("ca-chua-bi-huu-co");

      expect(result.activeBatchTrace).toEqual({
        batchCode: "LOT-2026-001",
        harvestDate: harvestDate.toISOString(),
        expirationDate: expirationDate.toISOString(),
        status: BatchStatus.IN_STOCK,
        plotCode: "PLOT-A1",
        plotName: "Nhà kính A1",
      });
      expect(result.rescueProgress).toBeNull();
    });

    it("computes rounded and clamped rescueProgress when active FEFO batch is near_expiry", async () => {
      // Invariant: INV-PROD-7
      const harvestDate = new Date("2026-11-25T06:00:00.000Z");
      const expirationDate = new Date("2026-11-28T06:00:00.000Z");

      mockDb.setSelectResultsQueue([
        [
          {
            product: sampleProductRow,
            category: sampleCategorySummary,
            availableQuantity: "3.33",
          },
        ],
        [
          {
            batchCode: "LOT-RESCUE-1",
            harvestDate,
            expirationDate,
            status: BatchStatus.NEAR_EXPIRY,
            initialQuantity: "10.00",
            availableQuantity: "3.33",
            plotCode: "PLOT-B2",
            plotName: "Nhà kính B2",
          },
        ],
        [
          {
            product: sampleProductRow,
            category: sampleCategorySummary,
            availableQuantity: "12.00",
          },
        ],
        [
          {
            batchCode: "LOT-RESCUE-CLAMP",
            harvestDate,
            expirationDate,
            status: BatchStatus.NEAR_EXPIRY,
            initialQuantity: "10.00",
            availableQuantity: "12.00",
            plotCode: "PLOT-B2",
            plotName: "Nhà kính B2",
          },
        ],
      ]);

      const partialResult =
        await service.getPublicProductBySlug("ca-chua-bi-huu-co");
      expect(partialResult.rescueProgress).toEqual({
        expiresAt: expirationDate.toISOString(),
        claimedPercent: 67,
      });

      const clampedResult =
        await service.getPublicProductBySlug("ca-chua-bi-huu-co");
      expect(clampedResult.rescueProgress).toEqual({
        expiresAt: expirationDate.toISOString(),
        claimedPercent: 0,
      });
    });

    it("throws NotFoundException when product or category is missing, inactive, or deleted", async () => {
      // Invariant: INV-CAT-1
      mockDb.setSelectResultsQueue([[]]);

      try {
        await service.getPublicProductBySlug("missing-product");
        expect.unreachable("Expected NotFoundException");
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        expect((error as NotFoundException).getResponse()).toEqual({
          code: API_ERROR_CODES.PRODUCT_NOT_FOUND,
          detail: MESSAGES.PRODUCTS.NOT_FOUND,
        });
      }
    });
  });

  describe("getAdminProductById", () => {
    it("maps zero and fractional availableQuantity decimal strings for admin reads", async () => {
      // Invariant: INV-PROD-3
      mockDb.setSelectResultsQueue([
        [
          {
            product: sampleProductRow,
            category: sampleCategorySummary,
            availableQuantity: "0.00",
          },
        ],
        [
          {
            product: sampleProductRow,
            category: sampleCategorySummary,
            availableQuantity: "45.50",
          },
        ],
      ]);

      const zeroResult = await service.getAdminProductById(productId);
      const stockedResult = await service.getAdminProductById(productId);

      expect(zeroResult.availableQuantity).toBe(0);
      expect(stockedResult.availableQuantity).toBe(45.5);
    });

    it("throws NotFoundException when admin target product is missing or soft-deleted", async () => {
      mockDb.setSelectResultsQueue([[]]);

      try {
        await service.getAdminProductById(productId);
        expect.unreachable("Expected NotFoundException");
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        expect((error as NotFoundException).getResponse()).toEqual({
          code: API_ERROR_CODES.PRODUCT_NOT_FOUND,
          detail: MESSAGES.PRODUCTS.NOT_FOUND,
        });
      }
    });
  });

  describe("createProduct", () => {
    it("returns availableQuantity 0 for a newly created product", async () => {
      // Invariant: INV-PROD-3
      mockDb.setSelectResultsQueue([
        [sampleCategorySummary],
        [sampleProductRow],
      ]);

      const result = await service.createProduct({
        categoryId,
        name: "Cà chua bi hữu cơ",
        slug: "ca-chua-bi-huu-co",
        basePriceVnd: 45000,
        unit: "kg",
        imageUrls: [],
        isVietGap: true,
        isUsda: false,
        isSubscriptionEligible: true,
        isActive: true,
      });

      expect(result.availableQuantity).toBe(0);
    });

    it("throws NotFoundException when target categoryId is missing or soft-deleted", async () => {
      mockDb.setSelectResultsQueue([[]]);

      try {
        await service.createProduct({
          categoryId,
          name: "Cà chua bi",
          slug: "ca-chua-bi",
          basePriceVnd: 45000,
          unit: "kg",
          imageUrls: [],
          isVietGap: true,
          isUsda: false,
          isSubscriptionEligible: true,
          isActive: true,
        });
        expect.unreachable("Expected NotFoundException");
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        expect((error as NotFoundException).getResponse()).toEqual({
          code: API_ERROR_CODES.CATEGORY_NOT_FOUND,
          detail: MESSAGES.CATEGORIES.NOT_FOUND,
        });
      }
    });

    it("rejects duplicate active slug on unique constraint violation", async () => {
      mockDb.setSelectResultsQueue([[sampleCategorySummary]]);
      mockDb.mockInsertValues.mockImplementationOnce(() => ({
        returning: () =>
          Promise.reject(
            Object.assign(new Error("unique violation"), {
              code: PG_ERROR_CODE.UNIQUE_VIOLATION,
              constraint: "products_slug_uidx",
            }),
          ),
      }));

      try {
        await service.createProduct({
          categoryId,
          name: "Cà chua bi",
          slug: "ca-chua-bi-huu-co",
          basePriceVnd: 45000,
          unit: "kg",
          imageUrls: [],
          isVietGap: true,
          isUsda: false,
          isSubscriptionEligible: true,
          isActive: true,
        });
        expect.unreachable("Expected ConflictException");
      } catch (error) {
        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).getResponse()).toEqual({
          code: API_ERROR_CODES.PRODUCT_SLUG_ALREADY_EXISTS,
          detail: MESSAGES.PRODUCTS.SLUG_ALREADY_EXISTS,
        });
      }
    });

    it("rejects price invariant check constraint violation", async () => {
      mockDb.setSelectResultsQueue([[sampleCategorySummary]]);
      mockDb.mockInsertValues.mockImplementationOnce(() => ({
        returning: () =>
          Promise.reject(
            Object.assign(new Error("check violation"), {
              code: PG_ERROR_CODE.CHECK_VIOLATION,
              constraint: "products_sale_price_lte_base_price",
            }),
          ),
      }));

      try {
        await service.createProduct({
          categoryId,
          name: "Cà chua bi",
          slug: "ca-chua-bi-check",
          basePriceVnd: 45000,
          unit: "kg",
          imageUrls: [],
          isVietGap: true,
          isUsda: false,
          isSubscriptionEligible: true,
          isActive: true,
        });
        expect.unreachable("Expected UnprocessableEntityException");
      } catch (error) {
        expect(error).toBeInstanceOf(UnprocessableEntityException);
        expect((error as UnprocessableEntityException).getResponse()).toEqual({
          code: API_ERROR_CODES.PRODUCT_PRICE_INVALID,
          detail: MESSAGES.PRODUCTS.PRICE_INVALID,
        });
      }
    });
  });

  describe("updateProduct", () => {
    it("rejects partial update when new salePriceVnd exceeds persisted basePrice", async () => {
      // Invariant: INV-PROD-1
      mockDb.setSelectResultsQueue([[sampleProductRow]]);

      try {
        await service.updateProduct(productId, { salePriceVnd: 50000 });
        expect.unreachable("Expected UnprocessableEntityException");
      } catch (error) {
        expect(error).toBeInstanceOf(UnprocessableEntityException);
        expect((error as UnprocessableEntityException).getResponse()).toEqual({
          code: API_ERROR_CODES.PRODUCT_PRICE_INVALID,
          detail: MESSAGES.PRODUCTS.PRICE_INVALID,
        });
      }
    });

    it("rejects partial update when lowered basePriceVnd drops below persisted salePrice", async () => {
      // Invariant: INV-PROD-1
      mockDb.setSelectResultsQueue([[sampleProductRow]]);

      try {
        await service.updateProduct(productId, { basePriceVnd: 30000 });
        expect.unreachable("Expected UnprocessableEntityException");
      } catch (error) {
        expect(error).toBeInstanceOf(UnprocessableEntityException);
        expect((error as UnprocessableEntityException).getResponse()).toEqual({
          code: API_ERROR_CODES.PRODUCT_PRICE_INVALID,
          detail: MESSAGES.PRODUCTS.PRICE_INVALID,
        });
      }
    });

    it("queries and returns live availableQuantity inside update transaction", async () => {
      // Invariant: INV-PROD-3
      mockDb.setSelectResultsQueue([
        [sampleProductRow],
        [sampleProductRow],
        [sampleCategorySummary],
        [{ availableQuantity: "25.75" }],
      ]);

      const result = await service.updateProduct(productId, {
        name: "Cà chua bi hữu cơ (mới)",
      });

      expect(result.availableQuantity).toBe(25.75);
    });
  });

  describe("deleteProduct", () => {
    it("throws NotFoundException when product does not exist or is already deleted", async () => {
      mockDb.setSelectResultsQueue([[]]);

      try {
        await service.deleteProduct(productId);
        expect.unreachable("Expected NotFoundException");
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        expect((error as NotFoundException).getResponse()).toEqual({
          code: API_ERROR_CODES.PRODUCT_NOT_FOUND,
          detail: MESSAGES.PRODUCTS.NOT_FOUND,
        });
      }
    });
  });
});

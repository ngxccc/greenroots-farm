import { beforeEach, describe, expect, it } from "bun:test";
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { API_ERROR_CODES } from "@greenroots/shared";
import { PG_ERROR_CODE } from "@/common/constants/error.constant";
import { MESSAGES } from "@/common/constants/messages.constant";
import { createMockDb } from "../../../test/mocks/mock-database";
import { CategoriesService } from "./categories.service";

type MockDb = ReturnType<typeof createMockDb> & {
  setSelectResultsQueue: (results: unknown[][]) => void;
  mockInsertValues: { mockImplementationOnce: (fn: () => unknown) => void };
  mockUpdateWhere: { mockImplementationOnce: (fn: () => unknown) => void };
};

describe("CategoriesService", () => {
  const rootId = "019fa8bc-8f4d-7000-b366-e691f45cfb10";
  const childId = "019fa8bc-8f4d-7000-b366-e691f45cfb11";
  const timestamp = new Date("2026-11-20T00:00:00.000Z");

  const sampleCategoryRow = {
    id: rootId,
    name: "Rau ăn lá",
    slug: "rau-an-la",
    description: "Các loại rau ăn lá hữu cơ",
    parentId: null,
    sortOrder: 1,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  let service: CategoriesService;
  let mockDb: MockDb;

  beforeEach(() => {
    mockDb = createMockDb() as unknown as MockDb;
    service = new CategoriesService(mockDb);
  });

  describe("listCategories", () => {
    it("escapes LIKE wildcards and builds pagination metadata", async () => {
      mockDb.setSelectResultsQueue([[{ total: 1 }], [sampleCategoryRow]]);

      const result = await service.listCategories(
        {
          q: "50%_\\",
          page: 1,
          limit: 20,
          sort: "sortOrder:asc",
        },
        { includeInactive: false },
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.createdAt).toBe(timestamp.toISOString());
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      });
    });
  });

  describe("getAdminCategoryById", () => {
    it("throws NotFoundException when category is missing or soft-deleted", async () => {
      mockDb.setSelectResultsQueue([[]]);

      try {
        await service.getAdminCategoryById(rootId);
        expect.unreachable("Expected NotFoundException");
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        expect((error as NotFoundException).getResponse()).toEqual({
          code: API_ERROR_CODES.CATEGORY_NOT_FOUND,
          detail: MESSAGES.CATEGORIES.NOT_FOUND,
        });
      }
    });
  });

  describe("createCategory", () => {
    it("rejects assigning a child category as parent to enforce two-level depth", async () => {
      // Invariant: INV-CAT-2
      mockDb.setSelectResultsQueue([[{ id: childId, parentId: rootId }]]);

      try {
        await service.createCategory({
          name: "Rau mầm",
          slug: "rau-mam",
          parentId: childId,
          sortOrder: 0,
          isActive: true,
        });
        expect.unreachable("Expected UnprocessableEntityException");
      } catch (error) {
        expect(error).toBeInstanceOf(UnprocessableEntityException);
        expect((error as UnprocessableEntityException).getResponse()).toEqual({
          code: API_ERROR_CODES.CATEGORY_HIERARCHY_INVALID,
          detail: MESSAGES.CATEGORIES.HIERARCHY_INVALID,
        });
      }
    });

    it("rejects duplicate active slug on unique constraint violation", async () => {
      mockDb.mockInsertValues.mockImplementationOnce(() => ({
        returning: () =>
          Promise.reject(
            Object.assign(new Error("unique violation"), {
              code: PG_ERROR_CODE.UNIQUE_VIOLATION,
              constraint: "categories_slug_uidx",
            }),
          ),
      }));

      try {
        await service.createCategory({
          name: "Rau ăn lá mới",
          slug: "rau-an-la",
          sortOrder: 0,
          isActive: true,
        });
        expect.unreachable("Expected ConflictException");
      } catch (error) {
        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).getResponse()).toEqual({
          code: API_ERROR_CODES.CATEGORY_SLUG_ALREADY_EXISTS,
          detail: MESSAGES.CATEGORIES.SLUG_ALREADY_EXISTS,
        });
      }
    });

    it("rejects duplicate active name on unique constraint violation", async () => {
      mockDb.mockInsertValues.mockImplementationOnce(() => ({
        returning: () =>
          Promise.reject(
            Object.assign(new Error("unique violation"), {
              code: PG_ERROR_CODE.UNIQUE_VIOLATION,
              constraint: "categories_name_uidx",
            }),
          ),
      }));

      try {
        await service.createCategory({
          name: "Rau ăn lá",
          slug: "rau-an-la-2",
          sortOrder: 0,
          isActive: true,
        });
        expect.unreachable("Expected ConflictException");
      } catch (error) {
        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).getResponse()).toEqual({
          code: API_ERROR_CODES.CATEGORY_NAME_ALREADY_EXISTS,
          detail: MESSAGES.CATEGORIES.NAME_ALREADY_EXISTS,
        });
      }
    });
  });

  describe("updateCategory", () => {
    it("rejects self-parenting before acquiring locks", async () => {
      // Invariant: INV-CAT-2
      try {
        await service.updateCategory(rootId, { parentId: rootId });
        expect.unreachable("Expected UnprocessableEntityException");
      } catch (error) {
        expect(error).toBeInstanceOf(UnprocessableEntityException);
        expect((error as UnprocessableEntityException).getResponse()).toEqual({
          code: API_ERROR_CODES.CATEGORY_HIERARCHY_INVALID,
          detail: MESSAGES.CATEGORIES.HIERARCHY_INVALID,
        });
      }
    });

    it("rejects assigning a parent to a category that already owns live child categories", async () => {
      // Invariant: INV-CAT-2
      const otherRootId = "019fa8bc-8f4d-7000-b366-e691f45cfb12";
      mockDb.setSelectResultsQueue([
        [
          { id: rootId, parentId: null },
          { id: otherRootId, parentId: null },
        ],
        [{ id: childId }],
      ]);

      try {
        await service.updateCategory(rootId, { parentId: otherRootId });
        expect.unreachable("Expected UnprocessableEntityException");
      } catch (error) {
        expect(error).toBeInstanceOf(UnprocessableEntityException);
        expect((error as UnprocessableEntityException).getResponse()).toEqual({
          code: API_ERROR_CODES.CATEGORY_HIERARCHY_INVALID,
          detail: MESSAGES.CATEGORIES.HIERARCHY_INVALID,
        });
      }
    });
  });

  describe("deleteCategory", () => {
    it("rejects deletion when live child categories exist", async () => {
      // Invariant: INV-CAT-3
      mockDb.setSelectResultsQueue([[{ id: rootId }], [{ id: childId }]]);

      try {
        await service.deleteCategory(rootId);
        expect.unreachable("Expected ConflictException");
      } catch (error) {
        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).getResponse()).toEqual({
          code: API_ERROR_CODES.CATEGORY_HAS_CHILDREN,
          detail: MESSAGES.CATEGORIES.HAS_CHILDREN,
        });
      }
    });

    it("rejects deletion when non-deleted products exist", async () => {
      // Invariant: INV-CAT-3
      const productId = "019fa8bc-8f4d-7000-b366-e691f45cfb20";
      mockDb.setSelectResultsQueue([[{ id: rootId }], [], [{ id: productId }]]);

      try {
        await service.deleteCategory(rootId);
        expect.unreachable("Expected ConflictException");
      } catch (error) {
        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).getResponse()).toEqual({
          code: API_ERROR_CODES.CATEGORY_HAS_PRODUCTS,
          detail: MESSAGES.CATEGORIES.HAS_PRODUCTS,
        });
      }
    });
  });
});

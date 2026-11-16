import { describe, expect, it } from "bun:test";
import { apiSuccess, buildPaginationMeta } from "./api-response.util";

describe("API Response Utilities", () => {
  describe("apiSuccess", () => {
    it("should construct a standard success envelope without meta", () => {
      const response = apiSuccess({ id: "user-1", name: "Farm Worker" });
      expect(response).toEqual({
        success: true,
        data: { id: "user-1", name: "Farm Worker" },
      });
      expect(response.meta).toBeUndefined();
    });

    it("should construct a standard success envelope with root-level meta", () => {
      const meta = { total: 42, cached: true };
      const response = apiSuccess(["item1", "item2"], meta);
      expect(response).toEqual({
        success: true,
        data: ["item1", "item2"],
        meta: { total: 42, cached: true },
      });
    });
  });

  describe("buildPaginationMeta", () => {
    it("should compute pagination metadata correctly for the first page", () => {
      const meta = buildPaginationMeta(100, 1, 20);
      expect(meta).toEqual({
        page: 1,
        limit: 20,
        total: 100,
        totalPages: 5,
        hasNextPage: true,
        hasPrevPage: false,
      });
    });

    it("should compute pagination metadata correctly for a middle page", () => {
      const meta = buildPaginationMeta(100, 3, 20);
      expect(meta).toEqual({
        page: 3,
        limit: 20,
        total: 100,
        totalPages: 5,
        hasNextPage: true,
        hasPrevPage: true,
      });
    });

    it("should compute pagination metadata correctly for the last page", () => {
      const meta = buildPaginationMeta(100, 5, 20);
      expect(meta).toEqual({
        page: 5,
        limit: 20,
        total: 100,
        totalPages: 5,
        hasNextPage: false,
        hasPrevPage: true,
      });
    });

    it("should handle empty results gracefully by defaulting totalPages to 1", () => {
      const meta = buildPaginationMeta(0, 1, 20);
      expect(meta).toEqual({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      });
    });

    it("should handle non-exact division by rounding up totalPages", () => {
      const meta = buildPaginationMeta(25, 2, 10);
      expect(meta).toEqual({
        page: 2,
        limit: 10,
        total: 25,
        totalPages: 3,
        hasNextPage: true,
        hasPrevPage: true,
      });
    });
  });
});

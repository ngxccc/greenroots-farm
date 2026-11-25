import { describe, expect, it } from "bun:test";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { API_ERROR_CODES } from "@greenroots/shared";
import { PG_ERROR_CODE } from "@/common/constants/error.constant";
import type { DrizzleDB } from "@/database/database.module";
import {
  generateSubscriptionPlanSlug,
  SubscriptionPlansService,
} from "./subscription-plans.service";

function createPlanRow(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-11-25T10:00:00.000Z");
  return {
    id: "019315bc-3e9a-7a1b-8f3e-2b1d0a5c4e9f",
    name: "Gói Rau Gia Đình 1 Tháng",
    slug: "goi-rau-gia-dinh-1-thang",
    description: "Gói rau hữu cơ định kỳ hàng tuần.",
    price: 1200000,
    totalDeliveries: 8,
    weightPerDeliveryKg: "5.00",
    basketDescription: "2kg rau ăn lá + 2kg rau củ quả + 1kg rau gia vị.",
    isActive: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

describe("generateSubscriptionPlanSlug", () => {
  describe("slug normalization", () => {
    it("transliterates Vietnamese diacritics and đ into lowercase kebab-case", () => {
      expect(generateSubscriptionPlanSlug("Gói Rau Gia Đình 1 Tháng")).toBe(
        "goi-rau-gia-dinh-1-thang",
      );
      expect(generateSubscriptionPlanSlug("Gói Ăn Dặm Cho Bé (Đậm Vị)")).toBe(
        "goi-an-dam-cho-be-dam-vi",
      );
    });

    it("falls back to a non-empty slug when input has no alphanumeric characters", () => {
      const slug = generateSubscriptionPlanSlug("---***---");
      expect(slug).toMatch(/^plan-[a-z0-9]+$/);
    });
  });
});

describe("SubscriptionPlansService", () => {
  describe("createPlan", () => {
    it("auto-generates a kebab-case slug from name when slug is omitted", async () => {
      let insertedValues: Record<string, unknown> | undefined;
      const mockDb = {
        insert: () => ({
          values: (vals: Record<string, unknown>) => {
            insertedValues = vals;
            return {
              returning: () => Promise.resolve([createPlanRow(vals)]),
            };
          },
        }),
      } as unknown as DrizzleDB;

      const service = new SubscriptionPlansService(mockDb);
      const result = await service.createPlan({
        name: "Gói Rau Gia Đình 1 Tháng",
        description: "Gói rau hữu cơ định kỳ hàng tuần.",
        priceVnd: 1200000,
        totalDeliveries: 8,
        weightPerDeliveryKg: 5,
        basketDescription: "2kg rau ăn lá + 2kg rau củ quả + 1kg rau gia vị.",
      });

      expect(insertedValues?.["slug"]).toBe("goi-rau-gia-dinh-1-thang");
      expect(insertedValues?.["weightPerDeliveryKg"]).toBe("5.00");
      expect(result.slug).toBe("goi-rau-gia-dinh-1-thang");
      expect(result.weightPerDeliveryKg).toBe(5);
    });

    it("maps PostgreSQL 23505 on subscription_plans_slug_uidx to conflict", async () => {
      const pgError = Object.assign(new Error("duplicate key"), {
        code: PG_ERROR_CODE.UNIQUE_VIOLATION,
        constraint: "subscription_plans_slug_uidx",
      });
      const mockDb = {
        insert: () => ({
          values: () => ({
            returning: () =>
              Promise.reject(
                Object.assign(new Error("query failed"), { cause: pgError }),
              ),
          }),
        }),
      } as unknown as DrizzleDB;

      const service = new SubscriptionPlansService(mockDb);

      try {
        await service.createPlan({
          name: "Gói Rau Gia Đình",
          slug: "goi-rau-gia-dinh",
          description: "Mô tả",
          priceVnd: 500000,
          totalDeliveries: 4,
          weightPerDeliveryKg: 3,
          basketDescription: "Giỏ 3kg",
        });
        expect.unreachable("Expected ConflictException");
      } catch (err) {
        expect(err).toBeInstanceOf(ConflictException);
        const response = (err as ConflictException).getResponse() as {
          code: string;
        };
        expect(response.code).toBe(
          API_ERROR_CODES.SUBSCRIPTION_PLAN_SLUG_CONFLICT,
        );
      }
    });
  });

  describe("updatePlan", () => {
    it("throws not found when target plan does not exist", async () => {
      const mockDb = {
        update: () => ({
          set: () => ({
            where: () => ({
              returning: () => Promise.resolve([]),
            }),
          }),
        }),
      } as unknown as DrizzleDB;

      const service = new SubscriptionPlansService(mockDb);

      try {
        await service.updatePlan("019315bc-3e9a-7a1b-8f3e-2b1d0a5c4e9f", {
          isActive: false,
        });
        expect.unreachable("Expected NotFoundException");
      } catch (err) {
        expect(err).toBeInstanceOf(NotFoundException);
        const response = (err as NotFoundException).getResponse() as {
          code: string;
        };
        expect(response.code).toBe(API_ERROR_CODES.SUBSCRIPTION_PLAN_NOT_FOUND);
      }
    });

    it("maps PostgreSQL 23505 on subscription_plans_slug_uidx to conflict", async () => {
      const pgError = Object.assign(new Error("duplicate key"), {
        code: PG_ERROR_CODE.UNIQUE_VIOLATION,
        constraint: "subscription_plans_slug_uidx",
      });
      const mockDb = {
        update: () => ({
          set: () => ({
            where: () => ({
              returning: () =>
                Promise.reject(
                  Object.assign(new Error("query failed"), { cause: pgError }),
                ),
            }),
          }),
        }),
      } as unknown as DrizzleDB;

      const service = new SubscriptionPlansService(mockDb);

      try {
        await service.updatePlan("019315bc-3e9a-7a1b-8f3e-2b1d0a5c4e9f", {
          slug: "existing-slug",
        });
        expect.unreachable("Expected ConflictException");
      } catch (err) {
        expect(err).toBeInstanceOf(ConflictException);
        const response = (err as ConflictException).getResponse() as {
          code: string;
        };
        expect(response.code).toBe(
          API_ERROR_CODES.SUBSCRIPTION_PLAN_SLUG_CONFLICT,
        );
      }
    });
  });
});

import { describe, expect, it } from "bun:test";
import {
  buildCreatePlanPayload,
  buildUpdatePlanPayload,
  canMutateSubscriptionPlans,
  evaluatePlanMutationGuard,
  filterSubscriptionPlans,
  type PlanFormValues,
  type SubscriptionPlanDto,
  validatePlanForm,
} from "./plans-utils";

function makePlan(
  overrides: Partial<SubscriptionPlanDto> = {},
): SubscriptionPlanDto {
  return {
    id: "019fa8bc-8f4d-7000-b366-e691f45cfb91",
    name: "Gói Gia Đình 4 Tuần",
    slug: "goi-gia-dinh-4-tuan",
    description: "Rau hữu cơ theo mùa giao định kỳ thứ 3 và thứ 6 hàng tuần.",
    priceVnd: 890000,
    totalDeliveries: 8,
    weightPerDeliveryKg: 3.5,
    basketDescription: "Cải ngọt, xà lách, cà chua bi, dưa leo và rau gia vị.",
    isActive: true,
    activeSubscriberCount: 12,
    createdAt: "2026-11-20T00:00:00.000Z",
    updatedAt: "2026-11-20T00:00:00.000Z",
    ...overrides,
  };
}

function makeFormValues(
  overrides: Partial<PlanFormValues> = {},
): PlanFormValues {
  return {
    name: "Gói Gia Đình 4 Tuần",
    slug: "goi-gia-dinh-4-tuan",
    description: "Rau hữu cơ theo mùa giao định kỳ thứ 3 và thứ 6 hàng tuần.",
    priceVnd: "890000",
    totalDeliveries: "8",
    weightPerDeliveryKg: "3.5",
    basketDescription: "Cải ngọt, xà lách, cà chua bi, dưa leo và rau gia vị.",
    isActive: true,
    ...overrides,
  };
}

describe("PlansUtils", () => {
  describe("validatePlanForm", () => {
    it("accepts valid plan form values when optional slug is omitted", () => {
      // Invariant: INV-PLAN-FORM-1
      expect(validatePlanForm(makeFormValues({ slug: "" }))).toBeNull();
      expect(validatePlanForm(makeFormValues())).toBeNull();
    });

    it("rejects empty or invalid kebab-case slug", () => {
      // Invariant: INV-PLAN-SLUG-1
      expect(
        validatePlanForm(makeFormValues({ slug: "Goi Rau Khong Hop Le" })),
      ).not.toBeNull();
      expect(
        validatePlanForm(makeFormValues({ slug: "-leading-dash" })),
      ).not.toBeNull();
    });

    it("rejects non-integer or non-positive VND price", () => {
      // Invariant: INV-PLAN-PRICE-1
      expect(
        validatePlanForm(makeFormValues({ priceVnd: "0" })),
      ).not.toBeNull();
      expect(
        validatePlanForm(makeFormValues({ priceVnd: "-50000" })),
      ).not.toBeNull();
      expect(
        validatePlanForm(makeFormValues({ priceVnd: "890000.5" })),
      ).not.toBeNull();
      expect(validatePlanForm(makeFormValues({ priceVnd: "" }))).not.toBeNull();
    });

    it("rejects non-integer or zero total deliveries", () => {
      // Invariant: INV-PLAN-DELIVERY-1
      expect(
        validatePlanForm(makeFormValues({ totalDeliveries: "0" })),
      ).not.toBeNull();
      expect(
        validatePlanForm(makeFormValues({ totalDeliveries: "2.5" })),
      ).not.toBeNull();
    });

    it("rejects weight per delivery outside allowed bounds", () => {
      // Invariant: INV-PLAN-WEIGHT-1
      expect(
        validatePlanForm(makeFormValues({ weightPerDeliveryKg: "0" })),
      ).not.toBeNull();
      expect(
        validatePlanForm(makeFormValues({ weightPerDeliveryKg: "1000" })),
      ).not.toBeNull();
      expect(
        validatePlanForm(makeFormValues({ weightPerDeliveryKg: "0.01" })),
      ).toBeNull();
      expect(
        validatePlanForm(makeFormValues({ weightPerDeliveryKg: "999.99" })),
      ).toBeNull();
    });

    it("rejects empty name, basket description, or description", () => {
      expect(validatePlanForm(makeFormValues({ name: "   " }))).not.toBeNull();
      expect(
        validatePlanForm(makeFormValues({ basketDescription: "" })),
      ).not.toBeNull();
      expect(
        validatePlanForm(makeFormValues({ description: "  " })),
      ).not.toBeNull();
    });
  });

  describe("buildCreatePlanPayload", () => {
    it("omits slug when blank and trims text fields", () => {
      const payload = buildCreatePlanPayload(
        makeFormValues({
          name: "  Gói Thanh Lọc  ",
          slug: "   ",
          priceVnd: "450000",
          totalDeliveries: "4",
          weightPerDeliveryKg: "2.256",
        }),
      );

      expect(payload).toEqual({
        name: "Gói Thanh Lọc",
        description:
          "Rau hữu cơ theo mùa giao định kỳ thứ 3 và thứ 6 hàng tuần.",
        priceVnd: 450000,
        totalDeliveries: 4,
        weightPerDeliveryKg: 2.26,
        basketDescription:
          "Cải ngọt, xà lách, cà chua bi, dưa leo và rau gia vị.",
        isActive: true,
      });
      expect("slug" in payload).toBe(false);
    });

    it("includes explicit slug when provided", () => {
      const payload = buildCreatePlanPayload(
        makeFormValues({ slug: "goi-thanh-loc" }),
      );
      expect(payload.slug).toBe("goi-thanh-loc");
    });
  });

  describe("buildUpdatePlanPayload", () => {
    it("returns null when no fields changed", () => {
      const plan = makePlan();
      const payload = buildUpdatePlanPayload(makeFormValues(), plan);
      expect(payload).toBeNull();
    });

    it("returns only modified fields including soft-retire state", () => {
      const plan = makePlan();
      const payload = buildUpdatePlanPayload(
        makeFormValues({
          priceVnd: "950000",
          isActive: false,
        }),
        plan,
      );

      expect(payload).toEqual({
        priceVnd: 950000,
        isActive: false,
      });
    });
  });

  describe("canMutateSubscriptionPlans", () => {
    it("allows admin and super_admin roles to mutate plans", () => {
      // Invariant: INV-PLAN-RBAC-1
      expect(canMutateSubscriptionPlans("admin")).toBe(true);
      expect(canMutateSubscriptionPlans("super_admin")).toBe(true);
    });

    it("blocks non-admin roles and unauthenticated users from mutating plans", () => {
      // Invariant: INV-PLAN-RBAC-1
      expect(canMutateSubscriptionPlans("farm_staff")).toBe(false);
      expect(canMutateSubscriptionPlans("customer")).toBe(false);
      expect(canMutateSubscriptionPlans(null)).toBe(false);
      expect(canMutateSubscriptionPlans(undefined)).toBe(false);
    });
  });

  describe("evaluatePlanMutationGuard", () => {
    it("returns localized denial reason for unauthorized roles", () => {
      const denied = evaluatePlanMutationGuard("farm_staff");
      expect(denied.allowed).toBe(false);
      expect(denied.reason).not.toBeNull();

      const allowed = evaluatePlanMutationGuard("admin");
      expect(allowed.allowed).toBe(true);
      expect(allowed.reason).toBeNull();
    });
  });

  describe("filterSubscriptionPlans", () => {
    const activePlan = makePlan({
      id: "plan-1",
      name: "Gói Gia Đình",
      slug: "goi-gia-dinh",
      isActive: true,
    });
    const retiredPlan = makePlan({
      id: "plan-2",
      name: "Gói Mùa Hè",
      slug: "goi-mua-he",
      isActive: false,
    });

    it("filters by status tab and case-insensitive search query", () => {
      const plans = [activePlan, retiredPlan];

      expect(filterSubscriptionPlans(plans, "", "all")).toHaveLength(2);
      expect(filterSubscriptionPlans(plans, "", "active")).toEqual([
        activePlan,
      ]);
      expect(filterSubscriptionPlans(plans, "", "inactive")).toEqual([
        retiredPlan,
      ]);
      expect(filterSubscriptionPlans(plans, "mua-he", "all")).toEqual([
        retiredPlan,
      ]);
      expect(filterSubscriptionPlans(plans, "gia đình", "active")).toEqual([
        activePlan,
      ]);
    });
  });
});

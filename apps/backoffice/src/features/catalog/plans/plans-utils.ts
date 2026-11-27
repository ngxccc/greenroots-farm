import type { UserRole } from "@greenroots/shared";
import { SLUG_PATTERN } from "@/features/catalog/catalog-utils";
import type { components } from "@/types/api-schema";

export type SubscriptionPlanDto = components["schemas"]["SubscriptionPlanDto"];
export type CreateSubscriptionPlanDto =
  components["schemas"]["CreateSubscriptionPlanDto"];
export type UpdateSubscriptionPlanDto =
  components["schemas"]["UpdateSubscriptionPlanDto"];

/** Maximum length for subscription plan names and slugs. */
export const MAX_PLAN_NAME_LENGTH = 255;

/** Maximum length for subscription plan descriptions and basket descriptions. */
export const MAX_PLAN_DESCRIPTION_LENGTH = 5000;

/** Minimum allowed weight per delivery in kilograms. */
export const MIN_PLAN_WEIGHT_KG = 0.01;

/** Maximum allowed weight per delivery in kilograms. */
export const MAX_PLAN_WEIGHT_KG = 999.99;

/**
 * Raw form state for creating or editing a seasonal subscription plan.
 */
export interface PlanFormValues {
  readonly name: string;
  readonly slug: string;
  readonly description: string;
  readonly priceVnd: string;
  readonly totalDeliveries: string;
  readonly weightPerDeliveryKg: string;
  readonly basketDescription: string;
  readonly isActive: boolean;
}

/**
 * Result of evaluating whether a staff role can mutate subscription plans.
 */
export interface PlanMutationGuard {
  readonly allowed: boolean;
  readonly reason: string | null;
}

/**
 * Status filter options for the subscription plans table.
 */
export type PlanStatusFilter = "all" | "active" | "inactive";

/**
 * Checks whether the given user role is authorized to create, edit, or retire subscription plans.
 *
 * @param role Authenticated user role from `useAuthStore`.
 * @returns `true` only for `admin` and `super_admin`.
 */
export function canMutateSubscriptionPlans(
  role: UserRole | null | undefined,
): boolean {
  return role === "admin" || role === "super_admin";
}

/**
 * Evaluates RBAC mutation permissions and returns a localized Vietnamese explanation when denied.
 *
 * @param role Authenticated user role from `useAuthStore`.
 * @returns Guard object with `allowed` flag and optional denial `reason`.
 */
export function evaluatePlanMutationGuard(
  role: UserRole | null | undefined,
): PlanMutationGuard {
  if (canMutateSubscriptionPlans(role)) {
    return { allowed: true, reason: null };
  }

  return {
    allowed: false,
    reason:
      "Chỉ Quản trị viên (Admin / Super Admin) mới có quyền tạo, chỉnh sửa hoặc ngừng bán gói rau định kỳ.",
  };
}

/**
 * Formats delivery weight in kilograms using `vi-VN` locale up to 2 decimal places.
 *
 * @param weightKg Weight per delivery in kilograms.
 * @returns Localized weight string without unit suffix.
 */
export function formatWeightKg(weightKg: number): string {
  return weightKg.toLocaleString("vi-VN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/**
 * Validates subscription plan form inputs against API DTO constraints.
 *
 * @param values Raw string and boolean values from the plan form.
 * @returns Localized Vietnamese error message, or `null` when valid.
 */
export function validatePlanForm(values: PlanFormValues): string | null {
  const name = values.name.trim();
  if (!name) {
    return "Vui lòng nhập tên gói định kỳ.";
  }
  if (name.length > MAX_PLAN_NAME_LENGTH) {
    return `Tên gói không được vượt quá ${MAX_PLAN_NAME_LENGTH} ký tự.`;
  }

  const slug = values.slug.trim();
  if (slug) {
    if (slug.length > MAX_PLAN_NAME_LENGTH) {
      return `Slug không được vượt quá ${MAX_PLAN_NAME_LENGTH} ký tự.`;
    }
    if (!SLUG_PATTERN.test(slug)) {
      return "Slug chỉ được gồm chữ thường không dấu, số và dấu gạch ngang (vd: goi-rau-gia-dinh).";
    }
  }

  const priceVnd = Number(values.priceVnd);
  if (!values.priceVnd.trim() || !Number.isInteger(priceVnd) || priceVnd < 1) {
    return "Giá gói phải là số nguyên dương (VNĐ).";
  }

  const totalDeliveries = Number(values.totalDeliveries);
  if (
    !values.totalDeliveries.trim() ||
    !Number.isInteger(totalDeliveries) ||
    totalDeliveries < 1
  ) {
    return "Số buổi giao phải là số nguyên lớn hơn hoặc bằng 1.";
  }

  const weightKg = Number(values.weightPerDeliveryKg);
  if (
    !values.weightPerDeliveryKg.trim() ||
    !Number.isFinite(weightKg) ||
    weightKg < MIN_PLAN_WEIGHT_KG ||
    weightKg > MAX_PLAN_WEIGHT_KG
  ) {
    return `Định mức mỗi buổi phải nằm trong khoảng ${MIN_PLAN_WEIGHT_KG} đến ${MAX_PLAN_WEIGHT_KG} kg.`;
  }

  const basketDescription = values.basketDescription.trim();
  if (!basketDescription) {
    return "Vui lòng nhập mô tả thành phần rổ rau mỗi buổi.";
  }
  if (basketDescription.length > MAX_PLAN_DESCRIPTION_LENGTH) {
    return `Mô tả rổ rau không được vượt quá ${MAX_PLAN_DESCRIPTION_LENGTH} ký tự.`;
  }

  const description = values.description.trim();
  if (!description) {
    return "Vui lòng nhập mô tả chi tiết gói định kỳ.";
  }
  if (description.length > MAX_PLAN_DESCRIPTION_LENGTH) {
    return `Mô tả chi tiết không được vượt quá ${MAX_PLAN_DESCRIPTION_LENGTH} ký tự.`;
  }

  return null;
}

/**
 * Maps validated form values to a `CreateSubscriptionPlanDto` payload.
 *
 * @param values Validated form values.
 * @returns Payload for `POST /api/v1/subscription-plans`.
 */
export function buildCreatePlanPayload(
  values: PlanFormValues,
): CreateSubscriptionPlanDto {
  const trimmedSlug = values.slug.trim();
  return {
    name: values.name.trim(),
    ...(trimmedSlug ? { slug: trimmedSlug } : {}),
    description: values.description.trim(),
    priceVnd: Number(values.priceVnd),
    totalDeliveries: Number(values.totalDeliveries),
    weightPerDeliveryKg: Number(Number(values.weightPerDeliveryKg).toFixed(2)),
    basketDescription: values.basketDescription.trim(),
    isActive: values.isActive,
  };
}

/**
 * Maps edited form values to a minimal `UpdateSubscriptionPlanDto` diff payload.
 *
 * @param values Validated form values.
 * @param original Existing subscription plan DTO being edited.
 * @returns Partial update payload for `PATCH /api/v1/subscription-plans/{id}`, or `null` if unchanged.
 */
export function buildUpdatePlanPayload(
  values: PlanFormValues,
  original: SubscriptionPlanDto,
): UpdateSubscriptionPlanDto | null {
  const nextName = values.name.trim();
  const nextSlug = values.slug.trim();
  const nextDescription = values.description.trim();
  const nextPriceVnd = Number(values.priceVnd);
  const nextTotalDeliveries = Number(values.totalDeliveries);
  const nextWeightKg = Number(Number(values.weightPerDeliveryKg).toFixed(2));
  const nextBasketDescription = values.basketDescription.trim();

  const payload: UpdateSubscriptionPlanDto = {};

  if (nextName !== original.name) {
    payload.name = nextName;
  }
  if (nextSlug && nextSlug !== original.slug) {
    payload.slug = nextSlug;
  }
  if (nextDescription !== original.description) {
    payload.description = nextDescription;
  }
  if (nextPriceVnd !== original.priceVnd) {
    payload.priceVnd = nextPriceVnd;
  }
  if (nextTotalDeliveries !== original.totalDeliveries) {
    payload.totalDeliveries = nextTotalDeliveries;
  }
  if (nextWeightKg !== original.weightPerDeliveryKg) {
    payload.weightPerDeliveryKg = nextWeightKg;
  }
  if (nextBasketDescription !== original.basketDescription) {
    payload.basketDescription = nextBasketDescription;
  }
  if (values.isActive !== original.isActive) {
    payload.isActive = values.isActive;
  }

  return Object.keys(payload).length > 0 ? payload : null;
}

/**
 * Filters subscription plans by search query and active status tab.
 *
 * @param plans Full list of subscription plans from the admin endpoint.
 * @param searchQuery Search string matched against plan name or slug.
 * @param statusFilter Status tab filter (`all` | `active` | `inactive`).
 * @returns Filtered list of subscription plans.
 */
export function filterSubscriptionPlans(
  plans: readonly SubscriptionPlanDto[],
  searchQuery: string,
  statusFilter: PlanStatusFilter,
): SubscriptionPlanDto[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();

  return plans.filter((plan) => {
    if (statusFilter === "active" && !plan.isActive) {
      return false;
    }
    if (statusFilter === "inactive" && plan.isActive) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    return (
      plan.name.toLowerCase().includes(normalizedQuery) ||
      plan.slug.toLowerCase().includes(normalizedQuery)
    );
  });
}

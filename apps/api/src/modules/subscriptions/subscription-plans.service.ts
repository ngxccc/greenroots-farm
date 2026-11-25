import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq, isNull } from "drizzle-orm";
import { API_ERROR_CODES } from "@greenroots/shared";
import { PG_ERROR_CODE } from "@/common/constants/error.constant";
import { MESSAGES } from "@/common/constants/messages.constant";
import { extractDatabaseErrorDetails } from "@/common/utils/error.util";
import {
  DATABASE_CONNECTION,
  type DrizzleDB,
} from "@/database/database.module";
import {
  subscriptionPlans,
  type SubscriptionPlan,
} from "@/database/schemas/subscription.schema";
import type {
  CreateSubscriptionPlanInput,
  SubscriptionPlanProjection,
  UpdateSubscriptionPlanInput,
} from "./dto";
import { SUBSCRIPTION_PLANS_SLUG_UIDX } from "./subscriptions.constant";

const SUBSCRIPTION_PLAN_COLUMNS = {
  id: subscriptionPlans.id,
  name: subscriptionPlans.name,
  slug: subscriptionPlans.slug,
  description: subscriptionPlans.description,
  price: subscriptionPlans.price,
  totalDeliveries: subscriptionPlans.totalDeliveries,
  weightPerDeliveryKg: subscriptionPlans.weightPerDeliveryKg,
  basketDescription: subscriptionPlans.basketDescription,
  isActive: subscriptionPlans.isActive,
  createdAt: subscriptionPlans.createdAt,
  updatedAt: subscriptionPlans.updatedAt,
} as const;

type SubscriptionPlanRow = Omit<SubscriptionPlan, "deletedAt">;

/**
 * Generates a lowercase kebab-case slug from a Vietnamese or ASCII plan name.
 *
 * @param name Sanitized plan display name.
 * @returns Non-empty kebab-case slug capped at 255 characters.
 */
export function generateSubscriptionPlanSlug(name: string): string {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 255)
    .replace(/-+$/g, "");

  return normalized.length > 0 ? normalized : `plan-${Date.now().toString(36)}`;
}

/**
 * Domain service managing seasonal subscription plans CRUD and public/admin projections.
 */
@Injectable()
export class SubscriptionPlansService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDB) {}

  /**
   * Lists active, non-deleted subscription plans for the public storefront.
   *
   * @returns Deterministically ordered active subscription plans.
   */
  async listPublicPlans(): Promise<SubscriptionPlanProjection[]> {
    const rows = await this.db
      .select(SUBSCRIPTION_PLAN_COLUMNS)
      .from(subscriptionPlans)
      .where(
        and(
          eq(subscriptionPlans.isActive, true),
          isNull(subscriptionPlans.deletedAt),
        ),
      )
      .orderBy(asc(subscriptionPlans.price), asc(subscriptionPlans.id));

    return rows.map((row) => this.toPlanProjection(row));
  }

  /**
   * Lists all non-deleted subscription plans (including retired plans) for backoffice admins.
   *
   * @returns Deterministically ordered non-deleted subscription plans.
   */
  async listAdminPlans(): Promise<SubscriptionPlanProjection[]> {
    const rows = await this.db
      .select(SUBSCRIPTION_PLAN_COLUMNS)
      .from(subscriptionPlans)
      .where(isNull(subscriptionPlans.deletedAt))
      .orderBy(asc(subscriptionPlans.price), asc(subscriptionPlans.id));

    return rows.map((row) => this.toPlanProjection(row));
  }

  /**
   * Creates a new subscription plan, auto-generating its slug from `name` when omitted.
   *
   * @param input Validated creation payload.
   * @returns Created subscription plan projection.
   * @throws ConflictException When an active plan with the same slug already exists.
   */
  async createPlan(
    input: CreateSubscriptionPlanInput,
  ): Promise<SubscriptionPlanProjection> {
    const slug = input.slug ?? generateSubscriptionPlanSlug(input.name);

    try {
      const [created] = await this.db
        .insert(subscriptionPlans)
        .values({
          name: input.name,
          slug,
          description: input.description,
          price: input.priceVnd,
          totalDeliveries: input.totalDeliveries,
          weightPerDeliveryKg: input.weightPerDeliveryKg.toFixed(2),
          basketDescription: input.basketDescription,
          isActive: input.isActive ?? true,
        })
        .returning(SUBSCRIPTION_PLAN_COLUMNS);

      if (!created) {
        throw new Error("Failed to persist subscription plan");
      }

      return this.toPlanProjection(created);
    } catch (error: unknown) {
      this.rethrowMappedDatabaseError(error);
      throw error;
    }
  }

  /**
   * Partially updates or soft-retires (`isActive = false`) an existing non-deleted plan.
   * Existing `subscriptions` rows keep their checkout-time plan snapshots untouched.
   *
   * @param id Target subscription plan UUIDv7.
   * @param input Validated partial update payload.
   * @returns Updated subscription plan projection.
   * @throws NotFoundException When the plan does not exist or is soft-deleted.
   * @throws ConflictException When the updated slug collides with another active plan.
   */
  async updatePlan(
    id: string,
    input: UpdateSubscriptionPlanInput,
  ): Promise<SubscriptionPlanProjection> {
    const patch: Partial<typeof subscriptionPlans.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (input.name !== undefined) patch.name = input.name;
    if (input.slug !== undefined) patch.slug = input.slug;
    if (input.description !== undefined) patch.description = input.description;
    if (input.priceVnd !== undefined) patch.price = input.priceVnd;
    if (input.totalDeliveries !== undefined) {
      patch.totalDeliveries = input.totalDeliveries;
    }
    if (input.weightPerDeliveryKg !== undefined) {
      patch.weightPerDeliveryKg = input.weightPerDeliveryKg.toFixed(2);
    }
    if (input.basketDescription !== undefined) {
      patch.basketDescription = input.basketDescription;
    }
    if (input.isActive !== undefined) patch.isActive = input.isActive;

    try {
      const [updated] = await this.db
        .update(subscriptionPlans)
        .set(patch)
        .where(
          and(
            eq(subscriptionPlans.id, id),
            isNull(subscriptionPlans.deletedAt),
          ),
        )
        .returning(SUBSCRIPTION_PLAN_COLUMNS);

      if (!updated) {
        throw new NotFoundException({
          code: API_ERROR_CODES.SUBSCRIPTION_PLAN_NOT_FOUND,
          detail: MESSAGES.SUBSCRIPTION_PLANS.NOT_FOUND,
        });
      }

      return this.toPlanProjection(updated);
    } catch (error: unknown) {
      this.rethrowMappedDatabaseError(error);
      throw error;
    }
  }

  private toPlanProjection(
    row: SubscriptionPlanRow,
  ): SubscriptionPlanProjection {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      priceVnd: row.price,
      totalDeliveries: row.totalDeliveries,
      weightPerDeliveryKg: Number(row.weightPerDeliveryKg),
      basketDescription: row.basketDescription,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private rethrowMappedDatabaseError(error: unknown): void {
    const dbError = extractDatabaseErrorDetails(error);
    if (
      dbError.isDatabaseError &&
      dbError.code === PG_ERROR_CODE.UNIQUE_VIOLATION &&
      dbError.constraint === SUBSCRIPTION_PLANS_SLUG_UIDX
    ) {
      throw new ConflictException({
        code: API_ERROR_CODES.SUBSCRIPTION_PLAN_SLUG_CONFLICT,
        detail: MESSAGES.SUBSCRIPTION_PLANS.SLUG_CONFLICT,
      });
    }
  }
}

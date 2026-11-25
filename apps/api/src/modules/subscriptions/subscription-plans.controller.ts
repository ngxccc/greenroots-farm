import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import { UserRole } from "@greenroots/shared";
import {
  ApiAuth,
  ApiBadRequestResponseRfc9457,
  ApiConflictResponseRfc9457,
  ApiCreatedResponseGeneric,
  ApiInternalServerErrorResponseRfc9457,
  ApiNotFoundResponseRfc9457,
  ApiOkResponseGeneric,
  ApiTooManyRequestsResponseRfc9457,
  Public,
} from "@/common/decorators";
import { ZodValidationPipe } from "@/common/pipes/zod-validation.pipe";
import { zUuidV7 } from "@/common/schemas/zod-primitives";
import { apiSuccess, type ApiResponse } from "@/common/utils/api-response.util";
import { SUBSCRIPTION_PLANS_ROUTES } from "./subscriptions.routes";
import {
  CreateSubscriptionPlanDto,
  SubscriptionPlanDto,
  UpdateSubscriptionPlanDto,
  type SubscriptionPlanProjection,
} from "./dto";
import { SubscriptionPlansService } from "./subscription-plans.service";

/**
 * Public and backoffice endpoints for seasonal subscription plans (`/api/v1/subscription-plans`).
 */
@ApiTags(SUBSCRIPTION_PLANS_ROUTES.TAG)
@Controller({ path: SUBSCRIPTION_PLANS_ROUTES.BASE, version: "1" })
@ApiBadRequestResponseRfc9457()
@ApiInternalServerErrorResponseRfc9457()
export class SubscriptionPlansController {
  constructor(
    private readonly subscriptionPlansService: SubscriptionPlansService,
  ) {}

  @Get()
  @Public()
  @SkipThrottle({ default: true, auth: true })
  @Throttle({
    public: { limit: 300, ttl: 60000 },
  })
  @ApiOperation({
    summary: "List active subscription plans",
    description:
      "Returns all active, non-deleted seasonal subscription plans ordered deterministically for storefront display.",
  })
  @ApiOkResponseGeneric(SubscriptionPlanDto, { isArray: true })
  @ApiTooManyRequestsResponseRfc9457()
  async listPublic(): Promise<ApiResponse<SubscriptionPlanProjection[]>> {
    const items = await this.subscriptionPlansService.listPublicPlans();
    return apiSuccess(items);
  }

  @Get(SUBSCRIPTION_PLANS_ROUTES.ADMIN)
  @ApiAuth(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "List all subscription plans for backoffice",
    description:
      "Returns all non-deleted subscription plans including retired (isActive = false) plans.",
  })
  @ApiOkResponseGeneric(SubscriptionPlanDto, { isArray: true })
  async listAdmin(): Promise<ApiResponse<SubscriptionPlanProjection[]>> {
    const items = await this.subscriptionPlansService.listAdminPlans();
    return apiSuccess(items);
  }

  @Post()
  @ApiAuth(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "Create a subscription plan",
    description:
      "Creates a seasonal subscription plan with positive integer VND price, delivery count, and weight per delivery, auto-generating a kebab-case slug when omitted.",
  })
  @ApiCreatedResponseGeneric(SubscriptionPlanDto)
  @ApiConflictResponseRfc9457()
  async create(
    @Body() dto: CreateSubscriptionPlanDto,
  ): Promise<ApiResponse<SubscriptionPlanProjection>> {
    const created = await this.subscriptionPlansService.createPlan(dto);
    return apiSuccess(created);
  }

  @Patch(SUBSCRIPTION_PLANS_ROUTES.BY_ID)
  @ApiAuth(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "Update or soft-retire a subscription plan",
    description:
      "Partially updates mutable subscription plan fields or soft-retires a plan via isActive = false without mutating existing subscription snapshots.",
  })
  @ApiParam({
    name: "id",
    type: "string",
    format: "uuid",
    description: "Subscription plan UUIDv7 identifier",
  })
  @ApiOkResponseGeneric(SubscriptionPlanDto)
  @ApiNotFoundResponseRfc9457()
  @ApiConflictResponseRfc9457()
  async update(
    @Param("id", new ZodValidationPipe(zUuidV7())) id: string,
    @Body() dto: UpdateSubscriptionPlanDto,
  ): Promise<ApiResponse<SubscriptionPlanProjection>> {
    const updated = await this.subscriptionPlansService.updatePlan(id, dto);
    return apiSuccess(updated);
  }
}

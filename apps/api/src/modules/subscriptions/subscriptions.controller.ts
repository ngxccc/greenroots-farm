import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@greenroots/shared";
import { IDEMPOTENCY_HEADER_NAME } from "@/common/constants/idempotency.constant";
import { ERROR_SLUGS, MESSAGES } from "@/common/constants/messages.constant";
import {
  ApiAuth,
  ApiBadRequestResponseRfc9457,
  ApiConflictResponseRfc9457,
  ApiCreatedResponseGeneric,
  ApiInternalServerErrorResponseRfc9457,
  ApiNotFoundResponseRfc9457,
  ApiOkResponseGeneric,
  ApiOkResponsePaginated,
  ApiRfc9457Response,
  ApiTooManyRequestsResponseRfc9457,
  ApiUnprocessableEntityResponseRfc9457,
  CurrentUser,
  Idempotent,
} from "@/common/decorators";
import type { PaginationMetaDto } from "@/common/dto/api-response.dto";
import { ZodValidationPipe } from "@/common/pipes/zod-validation.pipe";
import { zUuidV7 } from "@/common/schemas/zod-primitives";
import { apiSuccess, type ApiResponse } from "@/common/utils/api-response.util";
import {
  CreateSubscriptionCheckoutDto,
  ListMySubscriptionsQueryDto,
  SubscriptionDto,
  type SubscriptionProjection,
} from "./dto";
import { SUBSCRIPTIONS_ROUTES } from "./subscriptions.routes";
import { SubscriptionsService } from "./subscriptions.service";

/**
 * Customer prepaid subscription checkout and read endpoints (`/api/v1/subscriptions`).
 */
@ApiTags(SUBSCRIPTIONS_ROUTES.TAG)
@Controller({ path: SUBSCRIPTIONS_ROUTES.BASE, version: "1" })
@ApiBadRequestResponseRfc9457()
@ApiInternalServerErrorResponseRfc9457()
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  // Register static `me` route before `:id` so `/subscriptions/me` is never captured as a UUID parameter.
  @Get(SUBSCRIPTIONS_ROUTES.ME)
  @ApiAuth(UserRole.CUSTOMER)
  @ApiOperation({
    summary: "List customer subscriptions",
    description:
      "Returns a paginated list of subscriptions owned by the authenticated customer ordered by createdAt DESC, id DESC.",
  })
  @ApiOkResponsePaginated(SubscriptionDto)
  @ApiTooManyRequestsResponseRfc9457()
  async listMySubscriptions(
    @CurrentUser("sub") userId: string,
    @Query() query: ListMySubscriptionsQueryDto,
  ): Promise<ApiResponse<SubscriptionProjection[], PaginationMetaDto>> {
    const { items, meta } = await this.subscriptionsService.listMySubscriptions(
      userId,
      query,
    );
    return apiSuccess(items, meta);
  }

  @Get(SUBSCRIPTIONS_ROUTES.BY_ID)
  @ApiAuth(UserRole.CUSTOMER)
  @ApiOperation({
    summary: "Get customer subscription detail",
    description:
      "Returns a single subscription owned by the authenticated customer; returns 404 when missing or owned by another customer.",
  })
  @ApiParam({
    name: "id",
    type: "string",
    format: "uuid",
    description: "Subscription UUIDv7 identifier",
  })
  @ApiOkResponseGeneric(SubscriptionDto)
  @ApiNotFoundResponseRfc9457()
  @ApiTooManyRequestsResponseRfc9457()
  async getMySubscriptionById(
    @CurrentUser("sub") userId: string,
    @Param("id", new ZodValidationPipe(zUuidV7())) subscriptionId: string,
  ): Promise<ApiResponse<SubscriptionProjection>> {
    const subscription = await this.subscriptionsService.getMySubscriptionById(
      userId,
      subscriptionId,
    );
    return apiSuccess(subscription);
  }

  @Post()
  @ApiAuth(UserRole.CUSTOMER)
  @Idempotent({ required: true })
  @ApiOperation({
    summary: "Create a prepaid subscription checkout",
    description:
      "Validates delivery radius, locks the customer pending cap, snapshots plan/receiver/shipping quote in pending_payment status, and initiates a PayOS payment link.",
  })
  @ApiHeader({
    name: IDEMPOTENCY_HEADER_NAME,
    required: true,
    schema: { type: "string", format: "uuid" },
    description:
      "Required UUID idempotency key caching mutation responses for 24 hours per authenticated customer and endpoint.",
  })
  @ApiCreatedResponseGeneric(SubscriptionDto)
  @ApiNotFoundResponseRfc9457()
  @ApiConflictResponseRfc9457()
  @ApiUnprocessableEntityResponseRfc9457()
  @ApiTooManyRequestsResponseRfc9457()
  @ApiRfc9457Response({
    status: HttpStatus.BAD_GATEWAY,
    description: "Payment gateway link creation failed (Bad Gateway)",
    title: "Bad Gateway",
    detail: MESSAGES.PAYMENTS.GATEWAY_ERROR,
    typeSlug: ERROR_SLUGS.BAD_GATEWAY,
  })
  @ApiRfc9457Response({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description: "Idempotency store unavailable (Service Unavailable)",
    title: "Service Unavailable",
    detail: MESSAGES.COMMON.SERVICE_UNAVAILABLE,
    typeSlug: ERROR_SLUGS.SERVICE_UNAVAILABLE,
  })
  async createSubscriptionCheckout(
    @CurrentUser("sub") userId: string,
    @Body() dto: CreateSubscriptionCheckoutDto,
  ): Promise<ApiResponse<SubscriptionProjection>> {
    const created = await this.subscriptionsService.createSubscriptionCheckout(
      userId,
      dto,
    );
    return apiSuccess(created);
  }

  @Post(SUBSCRIPTIONS_ROUTES.CANCEL)
  @ApiAuth(UserRole.CUSTOMER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Cancel a pending subscription checkout",
    description:
      "Cancels an owned subscription in pending_payment status (or returns idempotently if already cancelled), clears reservationExpiresAt, marks pending payments as cancelled, and voids the PayOS payment link best-effort.",
  })
  @ApiParam({
    name: "id",
    type: "string",
    format: "uuid",
    description: "Subscription UUIDv7 identifier",
  })
  @ApiOkResponseGeneric(SubscriptionDto)
  @ApiNotFoundResponseRfc9457()
  @ApiUnprocessableEntityResponseRfc9457()
  @ApiTooManyRequestsResponseRfc9457()
  async cancelPendingSubscription(
    @CurrentUser("sub") userId: string,
    @Param("id", new ZodValidationPipe(zUuidV7())) subscriptionId: string,
  ): Promise<ApiResponse<SubscriptionProjection>> {
    const cancelled = await this.subscriptionsService.cancelPendingSubscription(
      userId,
      subscriptionId,
    );
    return apiSuccess(cancelled);
  }
}

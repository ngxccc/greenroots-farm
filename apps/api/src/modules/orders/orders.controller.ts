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
  ApiForbiddenResponseRfc9457,
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
  CheckoutRequestDto,
  ListMyOrdersQueryDto,
  OrderDto,
  ValidateCartRequestDto,
  ValidateCartResponseDto,
  type OrderProjection,
  type ValidateCartResponse,
} from "./dto";
import { ORDERS_ROUTES } from "./orders.routes";
import { OrdersService } from "./orders.service";

/**
 * Customer cart validation, retail COD checkout, and order history endpoints (`/api/v1/orders`).
 */
@ApiTags(ORDERS_ROUTES.TAG)
@Controller({ path: ORDERS_ROUTES.BASE, version: "1" })
@ApiAuth(UserRole.CUSTOMER)
@ApiBadRequestResponseRfc9457()
@ApiInternalServerErrorResponseRfc9457()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // Register static `me` route before `:id` so `/orders/me` is never captured as an order UUID parameter.
  @Get(ORDERS_ROUTES.ME)
  @ApiOperation({
    summary: "List customer order history",
    description:
      "Returns a paginated list of orders owned by the authenticated customer with optional status filtering and sorting.",
  })
  @ApiOkResponsePaginated(OrderDto)
  @ApiForbiddenResponseRfc9457()
  @ApiTooManyRequestsResponseRfc9457()
  async listMyOrders(
    @CurrentUser("sub") userId: string,
    @Query() query: ListMyOrdersQueryDto,
  ): Promise<ApiResponse<OrderProjection[], PaginationMetaDto>> {
    const { items, meta } = await this.ordersService.listMyOrders(
      userId,
      query,
    );
    return apiSuccess(items, meta);
  }

  @Get(ORDERS_ROUTES.BY_ID)
  @ApiOperation({
    summary: "Get customer order detail",
    description:
      "Returns a single order with line items and totals owned by the authenticated customer; returns 404 when missing or owned by another customer.",
  })
  @ApiParam({
    name: "id",
    type: "string",
    format: "uuid",
    description: "Order UUIDv7 identifier",
  })
  @ApiOkResponseGeneric(OrderDto)
  @ApiForbiddenResponseRfc9457()
  @ApiNotFoundResponseRfc9457()
  @ApiTooManyRequestsResponseRfc9457()
  async getMyOrderById(
    @CurrentUser("sub") userId: string,
    @Param("id", new ZodValidationPipe(zUuidV7())) orderId: string,
  ): Promise<ApiResponse<OrderProjection>> {
    const order = await this.ordersService.getMyOrderById(userId, orderId);
    return apiSuccess(order);
  }

  @Post(ORDERS_ROUTES.VALIDATE_CART)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Validate cart items, shipping quote, loyalty cap, and MOV",
    description:
      "Normalizes cart items and returns live sellable stock availability, server-recomputed catalog prices, optional shipping quote, loyalty cap, and minimum order value status without mutating persisted state.",
  })
  @ApiOkResponseGeneric(ValidateCartResponseDto)
  @ApiNotFoundResponseRfc9457()
  @ApiUnprocessableEntityResponseRfc9457()
  @ApiTooManyRequestsResponseRfc9457()
  async validateCart(
    @CurrentUser("sub") userId: string,
    @Body() dto: ValidateCartRequestDto,
  ): Promise<ApiResponse<ValidateCartResponse>> {
    const result = await this.ordersService.validateCart(userId, dto);
    return apiSuccess(result);
  }

  @Post(ORDERS_ROUTES.CHECKOUT)
  @Idempotent({ required: true })
  @ApiOperation({
    summary: "Place a Cash-on-Delivery retail order",
    description:
      "Atomically creates a COD order in pending_confirmation with server-recomputed pricing, enforced minimum order value, delivery radius validation, serialized loyalty-point deduction, and paired payment ledger record.",
  })
  @ApiHeader({
    name: IDEMPOTENCY_HEADER_NAME,
    required: true,
    schema: { type: "string", format: "uuid" },
    description:
      "Required UUID idempotency key caching mutation responses for 24 hours per authenticated customer and endpoint.",
  })
  @ApiCreatedResponseGeneric(OrderDto)
  @ApiNotFoundResponseRfc9457()
  @ApiConflictResponseRfc9457()
  @ApiUnprocessableEntityResponseRfc9457()
  @ApiTooManyRequestsResponseRfc9457()
  @ApiRfc9457Response({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description: "Idempotency store unavailable (Service Unavailable)",
    title: "Service Unavailable",
    detail: MESSAGES.COMMON.SERVICE_UNAVAILABLE,
    typeSlug: ERROR_SLUGS.SERVICE_UNAVAILABLE,
  })
  async checkout(
    @CurrentUser("sub") userId: string,
    @Body() dto: CheckoutRequestDto,
  ): Promise<ApiResponse<OrderProjection>> {
    const created = await this.ordersService.checkoutCod(userId, dto);
    return apiSuccess(created);
  }
}

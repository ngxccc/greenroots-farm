import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
  OrderPickListDto,
  StaffOrderDto,
  UpdateOrderStatusRequestDto,
  ValidateCartRequestDto,
  ValidateCartResponseDto,
  type OrderPickListProjection,
  type OrderProjection,
  type StaffOrderProjection,
  type ValidateCartResponse,
} from "./dto";
import { ORDERS_ROUTES } from "./orders.routes";
import { FULFILLMENT_ALLOWED_ROLES } from "./orders.constant";
import { OrdersService } from "./orders.service";

/**
 * Customer cart validation, retail COD checkout, order history, and staff fulfillment endpoints (`/api/v1/orders`).
 */
@ApiTags(ORDERS_ROUTES.TAG)
@Controller({ path: ORDERS_ROUTES.BASE, version: "1" })
@ApiBadRequestResponseRfc9457()
@ApiInternalServerErrorResponseRfc9457()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // Register static `me` route before `:id` so `/orders/me` is never captured as an order UUID parameter.
  @Get(ORDERS_ROUTES.ME)
  @ApiAuth(UserRole.CUSTOMER)
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
  @ApiAuth(UserRole.CUSTOMER)
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

  @Post(ORDERS_ROUTES.CANCEL)
  @ApiAuth(UserRole.CUSTOMER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Cancel a pending customer order",
    description:
      "Cancels an owned order in pending_payment or pending_confirmation status, soft-releasing any FEFO batch allocations, refunding used loyalty points, and cancelling pending payment records.",
  })
  @ApiParam({
    name: "id",
    type: "string",
    format: "uuid",
    description: "Order UUIDv7 identifier",
  })
  @ApiOkResponseGeneric(OrderDto)
  @ApiNotFoundResponseRfc9457()
  @ApiUnprocessableEntityResponseRfc9457()
  @ApiTooManyRequestsResponseRfc9457()
  async cancelMyOrder(
    @CurrentUser("sub") userId: string,
    @Param("id", new ZodValidationPipe(zUuidV7())) orderId: string,
  ): Promise<ApiResponse<OrderProjection>> {
    const cancelled = await this.ordersService.cancelMyOrder(userId, orderId);
    return apiSuccess(cancelled);
  }

  @Post(ORDERS_ROUTES.VALIDATE_CART)
  @ApiAuth(UserRole.CUSTOMER)
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
  @ApiAuth(UserRole.CUSTOMER)
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

  @Post(ORDERS_ROUTES.CONFIRM)
  @ApiAuth(...FULFILLMENT_ALLOWED_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Confirm a pending order with atomic FEFO batch allocation",
    description:
      "Locks candidate sellable batches in ascending ID order, allocates FEFO stock into batch_allocations, transitions the order to confirmed, and returns active allocations idempotently.",
  })
  @ApiParam({
    name: "id",
    type: "string",
    format: "uuid",
    description: "Order UUIDv7 identifier",
  })
  @ApiOkResponseGeneric(StaffOrderDto)
  @ApiNotFoundResponseRfc9457()
  @ApiConflictResponseRfc9457()
  @ApiTooManyRequestsResponseRfc9457()
  async confirmOrder(
    @Param("id", new ZodValidationPipe(zUuidV7())) orderId: string,
  ): Promise<ApiResponse<StaffOrderProjection>> {
    const confirmed = await this.ordersService.confirmOrder(orderId);
    return apiSuccess(confirmed);
  }

  @Patch(ORDERS_ROUTES.STATUS)
  @ApiAuth(...FULFILLMENT_ALLOWED_ROLES)
  @ApiOperation({
    summary: "Transition an order along the OrderStatus FSM",
    description:
      "Advances confirmed orders through packing, shipping, delivered, and completed, or cancels unpaid orders while soft-releasing allocations, restoring batch stock/status, and refunding loyalty points.",
  })
  @ApiParam({
    name: "id",
    type: "string",
    format: "uuid",
    description: "Order UUIDv7 identifier",
  })
  @ApiOkResponseGeneric(StaffOrderDto)
  @ApiNotFoundResponseRfc9457()
  @ApiConflictResponseRfc9457()
  @ApiUnprocessableEntityResponseRfc9457()
  @ApiTooManyRequestsResponseRfc9457()
  async updateOrderStatus(
    @Param("id", new ZodValidationPipe(zUuidV7())) orderId: string,
    @Body() dto: UpdateOrderStatusRequestDto,
  ): Promise<ApiResponse<StaffOrderProjection>> {
    const updated = await this.ordersService.updateOrderStatus(
      orderId,
      dto.status,
    );
    return apiSuccess(updated);
  }

  @Get(ORDERS_ROUTES.PICK_LIST)
  @ApiAuth(...FULFILLMENT_ALLOWED_ROLES)
  @Header("Cache-Control", "no-cache")
  @ApiOperation({
    summary: "Get FEFO batch-grouped pick list for a confirmed order",
    description:
      "Returns active FEFO batch allocations grouped by batch for orders in confirmed, packing, or shipping status without mutating stock.",
  })
  @ApiParam({
    name: "id",
    type: "string",
    format: "uuid",
    description: "Order UUIDv7 identifier",
  })
  @ApiOkResponseGeneric(OrderPickListDto)
  @ApiNotFoundResponseRfc9457()
  @ApiConflictResponseRfc9457()
  @ApiTooManyRequestsResponseRfc9457()
  async getOrderPickList(
    @Param("id", new ZodValidationPipe(zUuidV7())) orderId: string,
  ): Promise<ApiResponse<OrderPickListProjection>> {
    const pickList = await this.ordersService.getOrderPickList(orderId);
    return apiSuccess(pickList);
  }
}

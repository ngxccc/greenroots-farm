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
import { ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import {
  ApiAuth,
  ApiBadRequestResponseRfc9457,
  ApiInternalServerErrorResponseRfc9457,
  ApiNotFoundResponseRfc9457,
  ApiOkResponseGeneric,
  ApiOkResponsePaginated,
  ApiTooManyRequestsResponseRfc9457,
  ApiUnauthorizedResponseRfc9457,
  ApiUnprocessableEntityResponseRfc9457,
  CurrentUser,
  Public,
} from "@/common/decorators";
import type { PaginationMetaDto } from "@/common/dto/api-response.dto";
import { ZodValidationPipe } from "@/common/pipes/zod-validation.pipe";
import { zUuidV7 } from "@/common/schemas/zod-primitives";
import { apiSuccess, type ApiResponse } from "@/common/utils/api-response.util";
import {
  ListPaymentsQueryDto,
  PaymentLedgerItemDto,
  PayosWebhookRequestDto,
  PayosWebhookResponseDto,
  type PaymentLedgerItemProjection,
  type PayosWebhookResponse,
} from "./dto";
import { PAYMENTS_ALLOWED_ROLES } from "./payments.constant";
import { PAYMENTS_ROUTES } from "./payments.routes";
import { PaymentsService } from "./payments.service";
import { PaymentsWebhookService } from "./payments-webhook.service";

/**
 * Staff payment ledger, COD confirmation, and public PayOS webhook endpoints (`/api/v1/payments`).
 */
@ApiTags(PAYMENTS_ROUTES.TAG)
@Controller({ path: PAYMENTS_ROUTES.BASE, version: "1" })
@ApiBadRequestResponseRfc9457()
@ApiInternalServerErrorResponseRfc9457()
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly paymentsWebhookService: PaymentsWebhookService,
  ) {}

  @Get()
  @ApiAuth(...PAYMENTS_ALLOWED_ROLES)
  @ApiOperation({
    summary: "List staff payment ledger",
    description:
      "Returns a paginated, filtered, and searchable payment ledger hydrated with order/subscription codes and verifier names, excluding gateway rawPayload and paymentUrl.",
  })
  @ApiOkResponsePaginated(PaymentLedgerItemDto)
  @ApiTooManyRequestsResponseRfc9457()
  async listPayments(
    @Query() query: ListPaymentsQueryDto,
  ): Promise<ApiResponse<PaymentLedgerItemProjection[], PaginationMetaDto>> {
    const { items, meta } = await this.paymentsService.listPayments(query);
    return apiSuccess(items, meta);
  }

  @Post(PAYMENTS_ROUTES.CONFIRM_COD)
  @ApiAuth(...PAYMENTS_ALLOWED_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Confirm Cash-on-Delivery (COD) collection",
    description:
      "Atomically settles a pending COD payment for a shipping or delivered order, syncing orders.paymentStatus = paid and recording verifier attribution idempotently.",
  })
  @ApiParam({
    name: "id",
    type: "string",
    format: "uuid",
    description: "Payment UUIDv7 identifier",
  })
  @ApiOkResponseGeneric(PaymentLedgerItemDto)
  @ApiNotFoundResponseRfc9457()
  @ApiUnprocessableEntityResponseRfc9457()
  @ApiTooManyRequestsResponseRfc9457()
  async confirmCod(
    @Param("id", new ZodValidationPipe(zUuidV7())) paymentId: string,
    @CurrentUser("sub") actorUserId: string,
  ): Promise<ApiResponse<PaymentLedgerItemProjection>> {
    const payment = await this.paymentsService.confirmCod(
      paymentId,
      actorUserId,
    );
    return apiSuccess(payment);
  }

  @Post(PAYMENTS_ROUTES.PAYOS_WEBHOOK)
  @Public()
  @SkipThrottle({ default: true, auth: true })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Reconcile PayOS HMAC-SHA256 payment webhook",
    description:
      "Public webhook receiver that verifies PayOS HMAC-SHA256 signatures and idempotently settles pending PayOS orders.",
  })
  @ApiOkResponseGeneric(PayosWebhookResponseDto)
  @ApiUnauthorizedResponseRfc9457()
  @ApiNotFoundResponseRfc9457()
  @ApiUnprocessableEntityResponseRfc9457()
  async handlePayosWebhook(
    @Body() dto: PayosWebhookRequestDto,
  ): Promise<ApiResponse<PayosWebhookResponse>> {
    const result = await this.paymentsWebhookService.handlePayosWebhook(dto);
    return apiSuccess(result);
  }
}

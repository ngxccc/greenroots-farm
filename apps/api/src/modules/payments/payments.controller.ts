import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import {
  ApiBadRequestResponseRfc9457,
  ApiInternalServerErrorResponseRfc9457,
  ApiNotFoundResponseRfc9457,
  ApiOkResponseGeneric,
  ApiUnauthorizedResponseRfc9457,
  ApiUnprocessableEntityResponseRfc9457,
  Public,
} from "@/common/decorators";
import { apiSuccess, type ApiResponse } from "@/common/utils/api-response.util";
import {
  PayosWebhookRequestDto,
  PayosWebhookResponseDto,
  type PayosWebhookResponse,
} from "./dto";
import { PAYMENTS_ROUTES } from "./payments.routes";
import { PaymentsWebhookService } from "./payments-webhook.service";

/**
 * Public payment gateway webhook endpoints (`/api/v1/payments`).
 */
@ApiTags(PAYMENTS_ROUTES.TAG)
@Controller({ path: PAYMENTS_ROUTES.BASE, version: "1" })
@ApiBadRequestResponseRfc9457()
@ApiInternalServerErrorResponseRfc9457()
export class PaymentsController {
  constructor(
    private readonly paymentsWebhookService: PaymentsWebhookService,
  ) {}

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

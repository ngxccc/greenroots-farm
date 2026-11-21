import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@greenroots/shared";
import {
  ApiAuth,
  ApiBadRequestResponseRfc9457,
  ApiInternalServerErrorResponseRfc9457,
  ApiNotFoundResponseRfc9457,
  ApiOkResponseGeneric,
  ApiTooManyRequestsResponseRfc9457,
  ApiUnprocessableEntityResponseRfc9457,
  CurrentUser,
} from "@/common/decorators";
import { apiSuccess, type ApiResponse } from "@/common/utils/api-response.util";
import {
  ShippingQuoteDto,
  ShippingQuoteRequestDto,
  type ShippingQuote,
} from "./dto";
import { SHIPPING_ROUTES } from "./shipping.routes";
import { ShippingService } from "./shipping.service";

/**
 * Customer delivery quote endpoints (`/api/v1/shipping`).
 */
@ApiTags(SHIPPING_ROUTES.TAG)
@Controller({ path: SHIPPING_ROUTES.BASE, version: "1" })
@ApiAuth(UserRole.CUSTOMER)
@ApiBadRequestResponseRfc9457()
@ApiInternalServerErrorResponseRfc9457()
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  @Post(SHIPPING_ROUTES.QUOTE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Calculate shipping delivery quote",
    description:
      "Calculates server-authoritative straight-line distance, road distance, deliverability, and integer VND fee from dynamic farm settings for an owned address or HCMC district code.",
  })
  @ApiOkResponseGeneric(ShippingQuoteDto)
  @ApiNotFoundResponseRfc9457()
  @ApiUnprocessableEntityResponseRfc9457()
  @ApiTooManyRequestsResponseRfc9457()
  async quote(
    @CurrentUser("sub") userId: string,
    @Body() dto: ShippingQuoteRequestDto,
  ): Promise<ApiResponse<ShippingQuote>> {
    const result = await this.shippingService.quoteForCustomer(userId, dto);
    return apiSuccess(result);
  }
}

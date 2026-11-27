import { Controller, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  ApiAuth,
  ApiBadRequestResponseRfc9457,
  ApiInternalServerErrorResponseRfc9457,
  ApiOkResponseGeneric,
  ApiTooManyRequestsResponseRfc9457,
} from "@/common/decorators";
import { apiSuccess, type ApiResponse } from "@/common/utils/api-response.util";
import {
  ANALYTICS_ALLOWED_ROLES,
  ANALYTICS_FINANCE_ALLOWED_ROLES,
} from "./analytics.constant";
import { ANALYTICS_ROUTES } from "./analytics.routes";
import { AnalyticsService } from "./analytics.service";
import {
  FinanceAnalyticsDto,
  FinanceAnalyticsQueryDto,
  OperationsAnalyticsDto,
  OperationsAnalyticsQueryDto,
  type FinanceAnalytics,
  type OperationsAnalytics,
} from "./dto";

/**
 * Operational analytics endpoints for Admin and SuperAdmin (`/api/v1/analytics`).
 */
@ApiTags(ANALYTICS_ROUTES.TAG)
@Controller({ path: ANALYTICS_ROUTES.BASE, version: "1" })
@ApiBadRequestResponseRfc9457()
@ApiInternalServerErrorResponseRfc9457()
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get(ANALYTICS_ROUTES.OPERATIONS)
  @ApiAuth(...ANALYTICS_ALLOWED_ROLES)
  @ApiOperation({
    summary: "Get operational analytics",
    description:
      "Returns gross item revenue anchored on deliveredAt, harvest-cohort waste ratio, zero-filled time-series, and top products for ADMIN and SUPER_ADMIN without exposing payment cashflow.",
  })
  @ApiOkResponseGeneric(OperationsAnalyticsDto)
  @ApiTooManyRequestsResponseRfc9457()
  async getOperationsAnalytics(
    @Query() query: OperationsAnalyticsQueryDto,
  ): Promise<ApiResponse<OperationsAnalytics>> {
    const result = await this.analyticsService.getOperationsAnalytics(query);
    return apiSuccess(result);
  }

  @Get(ANALYTICS_ROUTES.FINANCE)
  @ApiAuth(...ANALYTICS_FINANCE_ALLOWED_ROLES)
  @ApiOperation({
    summary: "Get financial cashflow analytics",
    description:
      "Returns cash-basis PayOS (orders and subscriptions) vs. COD inflows, bank-transfer refund outflows, signed net cashflow anchored on payments.paid_at, and live pendingCodReceivableVnd for SUPER_ADMIN.",
  })
  @ApiOkResponseGeneric(FinanceAnalyticsDto)
  @ApiTooManyRequestsResponseRfc9457()
  async getFinanceAnalytics(
    @Query() query: FinanceAnalyticsQueryDto,
  ): Promise<ApiResponse<FinanceAnalytics>> {
    const result = await this.analyticsService.getFinanceAnalytics(query);
    return apiSuccess(result);
  }
}

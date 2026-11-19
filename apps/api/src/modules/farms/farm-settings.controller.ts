import { Body, Controller, Get, Patch } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@greenroots/shared";
import {
  ApiAuth,
  ApiBadRequestResponseRfc9457,
  ApiInternalServerErrorResponseRfc9457,
  ApiNotFoundResponseRfc9457,
  ApiOkResponseGeneric,
  ApiUnprocessableEntityResponseRfc9457,
} from "@/common/decorators";
import { apiSuccess, type ApiResponse } from "@/common/utils/api-response.util";
import {
  FarmSettingsDto,
  UpdateFarmSettingsDto,
  type FarmSettings,
} from "./dto";
import { FarmSettingsService } from "./farm-settings.service";
import { FARMS_ROUTES } from "./farms.routes";

/**
 * Singleton farm configuration endpoints (`/api/v1/farms/settings`).
 */
@ApiTags(FARMS_ROUTES.TAG)
@Controller({ path: FARMS_ROUTES.SETTINGS_BASE, version: "1" })
@ApiBadRequestResponseRfc9457()
@ApiInternalServerErrorResponseRfc9457()
export class FarmSettingsController {
  constructor(private readonly farmSettingsService: FarmSettingsService) {}

  @Get()
  @ApiAuth(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "Get singleton farm settings",
    description:
      "Returns the farm operational profile, shipping configuration, flash-sale thresholds, and payment toggles via the 24-hour Redis cache with PostgreSQL fallback.",
  })
  @ApiOkResponseGeneric(FarmSettingsDto)
  @ApiNotFoundResponseRfc9457()
  async getSettings(): Promise<ApiResponse<FarmSettings>> {
    const settings = await this.farmSettingsService.getSettings();
    return apiSuccess(settings);
  }

  @Patch()
  @ApiAuth(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "Update singleton farm settings",
    description:
      "Updates singleton farm settings as super_admin, enforces at least one enabled payment method, and invalidates the 24-hour Redis cache.",
  })
  @ApiOkResponseGeneric(FarmSettingsDto)
  @ApiNotFoundResponseRfc9457()
  @ApiUnprocessableEntityResponseRfc9457()
  async updateSettings(
    @Body() dto: UpdateFarmSettingsDto,
  ): Promise<ApiResponse<FarmSettings>> {
    const updated = await this.farmSettingsService.updateSettings(dto);
    return apiSuccess(updated);
  }
}

import {
  type Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { API_ERROR_CODES, BUSINESS_RULES } from "@greenroots/shared";
import { env } from "@/common/config/env.config";
import { MESSAGES } from "@/common/constants/messages.constant";
import type { FarmSettingsService } from "@/modules/farms/farm-settings.service";

/**
 * Resolves the farm's flash-sale hours threshold per ADR-0026:
 * fails closed in production, falls back to the shared default in non-production
 * when settings are missing, and rejects non-finite or non-positive values.
 */
export async function resolveFlashSaleHoursThreshold(
  farmSettingsService: Pick<FarmSettingsService, "getSettings">,
  logger: Logger,
): Promise<number> {
  try {
    const settings = await farmSettingsService.getSettings();
    const hoursThreshold = settings.flashSaleConfig.hoursThreshold;

    if (!Number.isFinite(hoursThreshold) || hoursThreshold <= 0) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.FARM_FLASH_SALE_CONFIG_INVALID,
        detail: MESSAGES.FARMS.FLASH_SALE_CONFIG_INVALID,
      });
    }

    return hoursThreshold;
  } catch (error) {
    if (error instanceof NotFoundException && env.NODE_ENV !== "production") {
      logger.warn(
        `Farm settings not found in ${env.NODE_ENV}; falling back to default ${BUSINESS_RULES.FLASH_SALE_HOURS_THRESHOLD}h threshold.`,
      );
      return BUSINESS_RULES.FLASH_SALE_HOURS_THRESHOLD;
    }

    throw error;
  }
}

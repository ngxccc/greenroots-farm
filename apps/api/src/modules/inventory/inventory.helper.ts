import {
  type Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { API_ERROR_CODES, BUSINESS_RULES } from "@greenroots/shared";
import { env } from "@/common/config/env.config";
import { MESSAGES } from "@/common/constants/messages.constant";
import type { FarmSettingsService } from "@/modules/farms/farm-settings.service";
import {
  FLASH_SALE_DISCOUNT_MAX,
  FLASH_SALE_DISCOUNT_MIN,
} from "./inventory.constant";

/**
 * Resolved farm flash-sale threshold and default discount configuration.
 */
export interface ResolvedFlashSaleConfig {
  readonly hoursThreshold: number;
  readonly discountPercent: number;
}

/**
 * Resolves the farm's flash-sale hours threshold and default discount percentage per ADR-0026:
 * fails closed in production, falls back to shared defaults in non-production
 * when settings are missing, and rejects invalid values.
 */
export async function resolveFlashSaleConfig(
  farmSettingsService: Pick<FarmSettingsService, "getSettings">,
  logger: Logger,
): Promise<ResolvedFlashSaleConfig> {
  try {
    const settings = await farmSettingsService.getSettings();
    const { hoursThreshold, discountPercent } = settings.flashSaleConfig;

    if (
      !Number.isFinite(hoursThreshold) ||
      hoursThreshold <= 0 ||
      !Number.isInteger(discountPercent) ||
      discountPercent < FLASH_SALE_DISCOUNT_MIN ||
      discountPercent > FLASH_SALE_DISCOUNT_MAX
    ) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.FARM_FLASH_SALE_CONFIG_INVALID,
        detail: MESSAGES.FARMS.FLASH_SALE_CONFIG_INVALID,
      });
    }

    return { hoursThreshold, discountPercent };
  } catch (error) {
    if (error instanceof NotFoundException && env.NODE_ENV !== "production") {
      logger.warn(
        `Farm settings not found in ${env.NODE_ENV}; falling back to default ${BUSINESS_RULES.FLASH_SALE_HOURS_THRESHOLD}h threshold and ${BUSINESS_RULES.FLASH_SALE_DISCOUNT_PERCENT}% discount.`,
      );
      return {
        hoursThreshold: BUSINESS_RULES.FLASH_SALE_HOURS_THRESHOLD,
        discountPercent: BUSINESS_RULES.FLASH_SALE_DISCOUNT_PERCENT,
      };
    }

    throw error;
  }
}

/**
 * Resolves the farm's flash-sale hours threshold per ADR-0026.
 */
export async function resolveFlashSaleHoursThreshold(
  farmSettingsService: Pick<FarmSettingsService, "getSettings">,
  logger: Logger,
): Promise<number> {
  const { hoursThreshold } = await resolveFlashSaleConfig(
    farmSettingsService,
    logger,
  );
  return hoursThreshold;
}

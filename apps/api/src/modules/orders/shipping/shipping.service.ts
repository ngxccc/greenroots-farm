import {
  BadRequestException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  API_ERROR_CODES,
  findHcmcDistrictByCode,
  type GeoCoordinate,
} from "@greenroots/shared";
import { MESSAGES } from "@/common/constants/messages.constant";
import { FarmSettingsService } from "@/modules/farms/farm-settings.service";
import { AddressService } from "@/modules/users/address.service";
import type { ShippingQuote, ShippingQuoteRequestInput } from "./dto";
import {
  SHIPPING_DRIVER_TOKEN,
  type ShippingDriver,
} from "./shipping.interface";

/**
 * Orchestrates server-authoritative delivery distance and fee quotes from
 * `FarmSettingsService`, `AddressService` / `HCMC_DISTRICTS`, and `ShippingDriver`.
 */
@Injectable()
export class ShippingService {
  constructor(
    private readonly addressService: AddressService,
    private readonly farmSettingsService: FarmSettingsService,
    @Inject(SHIPPING_DRIVER_TOKEN)
    private readonly shippingDriver: ShippingDriver,
  ) {}

  /**
   * Computes a shipping quote for an authenticated customer using either an owned
   * saved address (`addressId`) or a canonical HCMC `districtCode`.
   *
   * @param userId Authenticated customer UUID from JWT `sub`.
   * @param input Validated XOR quote request input.
   * @returns Closed shipping quote payload omitting all geographic coordinates.
   */
  async quoteForCustomer(
    userId: string,
    input: ShippingQuoteRequestInput,
  ): Promise<ShippingQuote> {
    const destination = await this.resolveDestination(userId, input);
    return this.quoteForCoordinates(destination, {
      isSubscription: input.isSubscription,
    });
  }

  /**
   * Computes a shipping quote for already-verified destination coordinates
   * against the farm's active runtime settings.
   *
   * @param destination Server-derived destination coordinates.
   * @param options Optional subscription delivery flag.
   * @returns Closed shipping quote payload with effective radius thresholds.
   */
  async quoteForCoordinates(
    destination: GeoCoordinate,
    options: { isSubscription?: boolean } = {},
  ): Promise<ShippingQuote> {
    const settings = await this.farmSettingsService.getSettings();
    const { maxRadiusKm, subscriptionFreeRadiusKm } = settings.shippingConfig;

    const quote = await this.shippingDriver.calculateQuote({
      origin: {
        latitude: settings.latitude,
        longitude: settings.longitude,
      },
      destination,
      config: settings.shippingConfig,
      isSubscription: options.isSubscription ?? false,
    });

    return {
      straightLineKm: quote.straightLineKm,
      roadDistanceKm: quote.roadDistanceKm,
      feeVnd: quote.feeVnd,
      isDeliverable: quote.isDeliverable,
      isFreeShipping: quote.isFreeShipping,
      maxRadiusKm,
      subscriptionFreeRadiusKm,
    };
  }

  private async resolveDestination(
    userId: string,
    input: ShippingQuoteRequestInput,
  ): Promise<GeoCoordinate> {
    if (input.addressId !== undefined) {
      const resolved = await this.addressService.resolveAddressForQuote(
        userId,
        input.addressId,
      );
      return {
        latitude: resolved.latitude,
        longitude: resolved.longitude,
      };
    }

    if (input.districtCode === undefined) {
      throw new BadRequestException({
        code: API_ERROR_CODES.VALIDATION_FAILED,
        detail: MESSAGES.VALIDATION.SHIPPING_QUOTE_TARGET_XOR,
      });
    }

    const district = findHcmcDistrictByCode(input.districtCode);
    if (!district) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.DISTRICT_CODE_INVALID,
        detail: MESSAGES.ADDRESS.DISTRICT_CODE_INVALID,
      });
    }

    return {
      latitude: district.latitude,
      longitude: district.longitude,
    };
  }
}

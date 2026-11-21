import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  API_ERROR_CODES,
  BUSINESS_RULES,
  HCMC_DISTRICTS,
} from "@greenroots/shared";
import { MESSAGES } from "@/common/constants/messages.constant";
import type { FarmSettings } from "@/modules/farms/dto";
import type { FarmSettingsService } from "@/modules/farms/farm-settings.service";
import type { AddressService } from "@/modules/users/address.service";
import type { ResolvedQuoteAddress } from "@/modules/users/users.interface";
import { HaversineShippingDriver } from "./drivers/haversine-shipping.driver";
import { ShippingService } from "./shipping.service";

describe("ShippingService", () => {
  const cuChi = HCMC_DISTRICTS.find((d) => d.code === "cu-chi")!;
  const hocMon = HCMC_DISTRICTS.find((d) => d.code === "hoc-mon")!;
  const canGio = HCMC_DISTRICTS.find((d) => d.code === "can-gio")!;

  const baseFarmSettings: FarmSettings = {
    id: "019fa8bc-8f4d-7000-b366-e691f45cfb90",
    name: BUSINESS_RULES.FARM_COORDINATES.NAME,
    legalName: "GreenRoots Farm Co.",
    tagline: null,
    taxId: null,
    address: BUSINESS_RULES.FARM_COORDINATES.ADDRESS,
    latitude: BUSINESS_RULES.FARM_COORDINATES.LATITUDE,
    longitude: BUSINESS_RULES.FARM_COORDINATES.LONGITUDE,
    certificationUrl: null,
    hotlines: { primary: "0909123456" },
    emails: { primary: "hello@greenroots.farm" },
    workingHours: { weekdays: "07:00-18:00", weekend: "07:00-12:00" },
    bankInfo: null,
    shippingConfig: {
      baseFeeVnd: 15000,
      freeKmThreshold: 3,
      perKmRateVnd: 5000,
      detourFactor: 1.3,
    },
    flashSaleConfig: {
      hoursThreshold: 48,
      discountPercent: 50,
    },
    isPayosEnabled: true,
    isCodEnabled: true,
    createdAt: "2026-11-21T00:00:00.000Z",
    updatedAt: "2026-11-21T00:00:00.000Z",
  };

  const resolvedAddress: ResolvedQuoteAddress = {
    id: "019fa8bc-8f4d-7000-b366-e691f45cfb99",
    receiverName: "Nguyen Van An",
    phoneNumber: "0912345678",
    formattedAddress: "123 TL8, Huyện Củ Chi, TP. Hồ Chí Minh",
    districtCode: cuChi.code,
    district: cuChi.name,
    city: BUSINESS_RULES.DEFAULT_DELIVERY_CITY,
    latitude: cuChi.latitude,
    longitude: cuChi.longitude,
  };

  let resolveAddressMock: ReturnType<typeof mock>;
  let getSettingsMock: ReturnType<typeof mock>;
  let service: ShippingService;

  beforeEach(() => {
    resolveAddressMock = mock(() => Promise.resolve(resolvedAddress));
    getSettingsMock = mock(() => Promise.resolve(baseFarmSettings));

    const mockAddressService = {
      resolveAddressForQuote: resolveAddressMock,
    } as unknown as AddressService;
    const mockFarmSettingsService = {
      getSettings: getSettingsMock,
    } as unknown as FarmSettingsService;

    service = new ShippingService(
      mockAddressService,
      mockFarmSettingsService,
      new HaversineShippingDriver(),
    );
  });

  // Invariant: INV-SHIP-1, INV-SHIP-2, INV-SHIP-7
  it("resolves districtCode from HCMC_DISTRICTS and applies BUSINESS_RULES fallback only for omitted optional radii", async () => {
    const result = await service.quoteForCustomer("user-1", {
      districtCode: hocMon.code,
      isSubscription: false,
    });

    expect(resolveAddressMock).not.toHaveBeenCalled();
    expect(getSettingsMock).toHaveBeenCalledTimes(1);
    expect(result.maxRadiusKm).toBe(BUSINESS_RULES.SHIPPING.MAX_RADIUS_KM);
    expect(result.subscriptionFreeRadiusKm).toBe(
      BUSINESS_RULES.SHIPPING.SUBSCRIPTION_FREE_RADIUS_KM,
    );
    expect(result.isDeliverable).toBe(true);
    expect(Object.keys(result).sort()).toEqual([
      "feeVnd",
      "isDeliverable",
      "isFreeShipping",
      "maxRadiusKm",
      "roadDistanceKm",
      "straightLineKm",
      "subscriptionFreeRadiusKm",
    ]);
  });

  // Invariant: INV-SHIP-1, INV-SHIP-6
  it("resolves owned addressId via AddressService and respects subscription free radius", async () => {
    const result = await service.quoteForCustomer("user-1", {
      addressId: resolvedAddress.id,
      isSubscription: true,
    });

    expect(resolveAddressMock).toHaveBeenCalledWith(
      "user-1",
      resolvedAddress.id,
    );
    expect(result.isDeliverable).toBe(true);
    expect(result.isFreeShipping).toBe(true);
    expect(result.feeVnd).toBe(0);
  });

  // Invariant: INV-SHIP-2
  it("uses dynamic maxRadiusKm and subscriptionFreeRadiusKm from FarmSettings when present", async () => {
    getSettingsMock.mockResolvedValueOnce({
      ...baseFarmSettings,
      shippingConfig: {
        ...baseFarmSettings.shippingConfig,
        baseFeeVnd: 25000,
        maxRadiusKm: 150,
        subscriptionFreeRadiusKm: 10,
      },
    });

    const result = await service.quoteForCustomer("user-1", {
      districtCode: canGio.code,
      isSubscription: true,
    });

    expect(result.maxRadiusKm).toBe(150);
    expect(result.subscriptionFreeRadiusKm).toBe(10);
    expect(result.isDeliverable).toBe(true);
    expect(result.isFreeShipping).toBe(false);
    expect(result.feeVnd).toBeGreaterThan(25000);
  });

  it("throws UnprocessableEntityException when districtCode is unknown", async () => {
    try {
      await service.quoteForCustomer("user-1", {
        districtCode: "quan-99",
        isSubscription: false,
      });
      expect.unreachable("Expected UnprocessableEntityException");
    } catch (error) {
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect((error as UnprocessableEntityException).getResponse()).toEqual({
        code: API_ERROR_CODES.DISTRICT_CODE_INVALID,
        detail: MESSAGES.ADDRESS.DISTRICT_CODE_INVALID,
      });
    }
    expect(getSettingsMock).not.toHaveBeenCalled();
  });

  // Invariant: INV-SHIP-2
  it("fails closed when the singleton farm settings record is missing", async () => {
    getSettingsMock.mockRejectedValueOnce(
      new NotFoundException({
        code: API_ERROR_CODES.FARM_NOT_FOUND,
        detail: MESSAGES.FARMS.NOT_FOUND,
      }),
    );

    try {
      await service.quoteForCustomer("user-1", {
        districtCode: cuChi.code,
        isSubscription: false,
      });
      expect.unreachable("Expected NotFoundException");
    } catch (error) {
      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).getResponse()).toEqual({
        code: API_ERROR_CODES.FARM_NOT_FOUND,
        detail: MESSAGES.FARMS.NOT_FOUND,
      });
    }
  });
});

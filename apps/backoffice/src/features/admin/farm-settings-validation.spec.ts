import { describe, expect, it } from "bun:test";
import type { components } from "@/types/api-schema";
import {
  mapFarmSettingsDtoToFormValues,
  mapFormValuesToUpdateFarmSettingsDto,
  validateFarmSettingsForm,
  validateShippingRadii,
  type FarmSettingsFormValues,
} from "./farm-settings-validation";

type FarmSettingsDto = components["schemas"]["FarmSettingsDto"];

function createValidFormValues(
  overrides: Partial<FarmSettingsFormValues> = {},
): FarmSettingsFormValues {
  return {
    name: "GreenRoots Farm",
    legalName: "Công ty TNHH GreenRoots Farm",
    tagline: "Rau hữu cơ thu hoạch trong ngày",
    taxId: "0312345678",
    address: "Xã Lạc Xuân, Huyện Đơn Dương, Tỉnh Lâm Đồng",
    latitude: 11.7975,
    longitude: 108.5322,
    certificationUrl:
      "https://res.cloudinary.com/demo/image/upload/vietgap.png",
    hotlinePrimary: "02838221100",
    hotlineSupport: "0909123456",
    emailPrimary: "hello@greenroots.vn",
    emailSupport: "support@greenroots.vn",
    weekdaysHours: "07:00 - 18:00",
    weekendHours: "07:30 - 12:00",
    baseFeeVnd: 15000,
    freeKmThreshold: 3,
    perKmRateVnd: 5000,
    detourFactor: 1.3,
    maxRadiusKm: 25,
    subscriptionFreeRadiusKm: 20,
    hoursThreshold: 48,
    discountPercent: 50,
    isPayosEnabled: true,
    isCodEnabled: true,
    bankName: "Vietcombank",
    accountNumber: "0123456789",
    accountHolder: "CONG TY TNHH GREENROOTS",
    ...overrides,
  };
}

describe("farm-settings-validation", () => {
  describe("validateShippingRadii", () => {
    it("accepts valid radii including exact boundary equality", () => {
      // Invariant: INV-SHIP-3
      expect(
        validateShippingRadii({
          maxRadiusKm: 25,
          subscriptionFreeRadiusKm: 25,
          freeKmThreshold: 25,
        }),
      ).toEqual({});
    });

    it("rejects subscriptionFreeRadiusKm exceeding maxRadiusKm", () => {
      // Invariant: INV-SHIP-3
      const errors = validateShippingRadii({
        maxRadiusKm: 25,
        subscriptionFreeRadiusKm: 26,
        freeKmThreshold: 3,
      });

      expect(errors.subscriptionFreeRadiusKm).toBeTruthy();
      expect(errors.freeKmThreshold).toBeUndefined();
    });

    it("rejects freeKmThreshold exceeding maxRadiusKm", () => {
      // Invariant: INV-SHIP-3
      const errors = validateShippingRadii({
        maxRadiusKm: 15,
        subscriptionFreeRadiusKm: 10,
        freeKmThreshold: 18,
      });

      expect(errors.freeKmThreshold).toBeTruthy();
      expect(errors.subscriptionFreeRadiusKm).toBeUndefined();
    });

    it("reports both radius errors simultaneously when both exceed maxRadiusKm", () => {
      // Invariant: INV-SHIP-3
      const errors = validateShippingRadii({
        maxRadiusKm: 10,
        subscriptionFreeRadiusKm: 15,
        freeKmThreshold: 12,
      });

      expect(errors.subscriptionFreeRadiusKm).toBeTruthy();
      expect(errors.freeKmThreshold).toBeTruthy();
    });

    it("rejects non-positive radius values", () => {
      const errors = validateShippingRadii({
        maxRadiusKm: 0,
        subscriptionFreeRadiusKm: -5,
        freeKmThreshold: 0,
      });

      expect(errors.maxRadiusKm).toBeTruthy();
      expect(errors.subscriptionFreeRadiusKm).toBeTruthy();
      expect(errors.freeKmThreshold).toBeTruthy();
    });
  });

  describe("validateFarmSettingsForm", () => {
    it("rejects disabling both PayOS and COD payment methods", () => {
      const errors = validateFarmSettingsForm(
        createValidFormValues({
          isPayosEnabled: false,
          isCodEnabled: false,
        }),
      );

      expect(errors.paymentMethods).toBeTruthy();
    });

    it("rejects partial bankInfo when only some bank fields are populated", () => {
      const errors = validateFarmSettingsForm(
        createValidFormValues({
          bankName: "Vietcombank",
          accountNumber: "",
          accountHolder: "",
        }),
      );

      expect(errors.bankInfo).toBeTruthy();
    });

    it("returns no errors when all required fields and invariants are satisfied", () => {
      const errors = validateFarmSettingsForm(createValidFormValues());
      expect(errors).toEqual({});
    });
  });

  describe("mapFarmSettingsDtoToFormValues & mapFormValuesToUpdateFarmSettingsDto", () => {
    it("round-trips FarmSettingsDto through form values without soil or water test fields", () => {
      const dto: FarmSettingsDto = {
        id: "0195a8f0-0001-7000-8000-000000000099",
        name: "GreenRoots Farm",
        legalName: "Công ty TNHH GreenRoots Farm",
        tagline: null,
        taxId: null,
        address: "Đơn Dương, Lâm Đồng",
        latitude: 11.7975,
        longitude: 108.5322,
        certificationUrl: null,
        hotlines: { primary: "02838221100" },
        emails: { primary: "hello@greenroots.vn" },
        workingHours: { weekdays: "07:00 - 18:00", weekend: "08:00 - 12:00" },
        bankInfo: null,
        shippingConfig: {
          baseFeeVnd: 15000,
          freeKmThreshold: 3,
          perKmRateVnd: 5000,
          detourFactor: 1.3,
          maxRadiusKm: 25,
          subscriptionFreeRadiusKm: 20,
        },
        flashSaleConfig: {
          hoursThreshold: 48,
          discountPercent: 50,
        },
        isPayosEnabled: true,
        isCodEnabled: true,
        createdAt: "2026-11-20T00:00:00.000Z",
        updatedAt: "2026-11-20T00:00:00.000Z",
      };

      const formValues = mapFarmSettingsDtoToFormValues(dto);
      const payload = mapFormValuesToUpdateFarmSettingsDto(formValues);

      expect(payload.tagline).toBeNull();
      expect(payload.bankInfo).toBeNull();
      expect(payload.certificationUrl).toBeNull();
      expect(payload.shippingConfig?.maxRadiusKm).toBe(25);
      expect(payload.shippingConfig?.subscriptionFreeRadiusKm).toBe(20);
      expect("soilTestResult" in payload).toBe(false);
      expect("waterTestResult" in payload).toBe(false);
    });
  });
});

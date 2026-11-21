import { describe, expect, it } from "bun:test";
import { BadRequestException } from "@nestjs/common";
import { API_ERROR_CODES } from "@greenroots/shared";
import { MESSAGES } from "@/common/constants/messages.constant";
import {
  type InvalidParam,
  ZodValidationPipe,
} from "@/common/pipes/zod-validation.pipe";
import { UpdateFarmSettingsDto } from "./update-farm-settings.dto";

describe("UpdateFarmSettingsDto", () => {
  const pipe = new ZodValidationPipe();
  const metadata = { type: "body" as const, metatype: UpdateFarmSettingsDto };

  const validShippingConfig = {
    baseFeeVnd: 15000,
    freeKmThreshold: 3,
    perKmRateVnd: 5000,
    detourFactor: 1.3,
    maxRadiusKm: 25,
    subscriptionFreeRadiusKm: 20,
  };

  function captureValidationError(payload: unknown): {
    code: string;
    invalidParams: InvalidParam[];
  } {
    try {
      pipe.transform(payload, metadata);
      expect.unreachable("Expected BadRequestException");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      return (error as BadRequestException).getResponse() as {
        code: string;
        invalidParams: InvalidParam[];
      };
    }
  }

  // Invariant: INV-FARM-5
  it("accepts valid shippingConfig with required radii and boundary equality", () => {
    const equalBoundary = {
      shippingConfig: {
        ...validShippingConfig,
        freeKmThreshold: 25,
        subscriptionFreeRadiusKm: 25,
        maxRadiusKm: 25,
      },
    };

    expect(pipe.transform(equalBoundary, metadata)).toEqual(equalBoundary);
  });

  // Invariant: INV-FARM-5
  it("rejects shippingConfig payloads omitting maxRadiusKm or subscriptionFreeRadiusKm", () => {
    const missingBoth = captureValidationError({
      shippingConfig: {
        baseFeeVnd: 15000,
        freeKmThreshold: 3,
        perKmRateVnd: 5000,
        detourFactor: 1.3,
      },
    });

    expect(missingBoth.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
    expect(missingBoth.invalidParams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "shippingConfig.maxRadiusKm",
          code: API_ERROR_CODES.REQUIRED,
        }),
        expect.objectContaining({
          name: "shippingConfig.subscriptionFreeRadiusKm",
          code: API_ERROR_CODES.REQUIRED,
        }),
      ]),
    );

    const missingMaxOnly = captureValidationError({
      shippingConfig: {
        baseFeeVnd: 15000,
        freeKmThreshold: 3,
        perKmRateVnd: 5000,
        detourFactor: 1.3,
        subscriptionFreeRadiusKm: 20,
      },
    });
    expect(missingMaxOnly.invalidParams).toEqual([
      expect.objectContaining({
        name: "shippingConfig.maxRadiusKm",
        code: API_ERROR_CODES.REQUIRED,
      }),
    ]);

    const missingSubOnly = captureValidationError({
      shippingConfig: {
        baseFeeVnd: 15000,
        freeKmThreshold: 3,
        perKmRateVnd: 5000,
        detourFactor: 1.3,
        maxRadiusKm: 25,
      },
    });
    expect(missingSubOnly.invalidParams).toEqual([
      expect.objectContaining({
        name: "shippingConfig.subscriptionFreeRadiusKm",
        code: API_ERROR_CODES.REQUIRED,
      }),
    ]);
  });

  // Invariant: INV-FARM-5
  it("rejects zero or negative maxRadiusKm and subscriptionFreeRadiusKm", () => {
    const res = captureValidationError({
      shippingConfig: {
        ...validShippingConfig,
        maxRadiusKm: 0,
        subscriptionFreeRadiusKm: -5,
      },
    });

    expect(res.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
    expect(res.invalidParams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "shippingConfig.maxRadiusKm",
          code: API_ERROR_CODES.TOO_SMALL,
        }),
        expect.objectContaining({
          name: "shippingConfig.subscriptionFreeRadiusKm",
          code: API_ERROR_CODES.TOO_SMALL,
        }),
      ]),
    );
  });

  // Invariant: INV-FARM-6
  it("rejects subscriptionFreeRadiusKm exceeding maxRadiusKm with dedicated validation code", () => {
    const res = captureValidationError({
      shippingConfig: {
        ...validShippingConfig,
        maxRadiusKm: 20,
        subscriptionFreeRadiusKm: 25,
      },
    });

    expect(res.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
    expect(res.invalidParams).toEqual([
      {
        name: "shippingConfig.subscriptionFreeRadiusKm",
        code: API_ERROR_CODES.FARM_SHIPPING_SUBSCRIPTION_RADIUS_INVALID,
        reason: MESSAGES.VALIDATION.FARM_SHIPPING_SUBSCRIPTION_RADIUS_INVALID,
        params: undefined,
      },
    ]);
  });

  // Invariant: INV-FARM-6
  it("rejects freeKmThreshold exceeding maxRadiusKm with dedicated validation code", () => {
    const res = captureValidationError({
      shippingConfig: {
        ...validShippingConfig,
        freeKmThreshold: 30,
        maxRadiusKm: 25,
      },
    });

    expect(res.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
    expect(res.invalidParams).toEqual([
      {
        name: "shippingConfig.freeKmThreshold",
        code: API_ERROR_CODES.FARM_SHIPPING_FREE_THRESHOLD_INVALID,
        reason: MESSAGES.VALIDATION.FARM_SHIPPING_FREE_THRESHOLD_INVALID,
        params: undefined,
      },
    ]);
  });

  // Invariant: INV-FARM-6
  it("reports both radius violations independently when both thresholds exceed maxRadiusKm", () => {
    const res = captureValidationError({
      shippingConfig: {
        ...validShippingConfig,
        freeKmThreshold: 30,
        subscriptionFreeRadiusKm: 28,
        maxRadiusKm: 25,
      },
    });

    expect(res.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
    expect(res.invalidParams).toHaveLength(2);
    expect(res.invalidParams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "shippingConfig.subscriptionFreeRadiusKm",
          code: API_ERROR_CODES.FARM_SHIPPING_SUBSCRIPTION_RADIUS_INVALID,
        }),
        expect.objectContaining({
          name: "shippingConfig.freeKmThreshold",
          code: API_ERROR_CODES.FARM_SHIPPING_FREE_THRESHOLD_INVALID,
        }),
      ]),
    );
  });
});

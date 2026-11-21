import { describe, expect, it } from "bun:test";
import { BadRequestException } from "@nestjs/common";
import { API_ERROR_CODES } from "@greenroots/shared";
import { z } from "zod";
import { MESSAGES } from "@/common/constants/messages.constant";
import {
  formatZodIssuePath,
  type InvalidParam,
  ZodValidationPipe,
} from "./zod-validation.pipe";

describe("ZodValidationPipe", () => {
  const testSchema = z.object({
    name: z.string().min(3),
    age: z.number().int().positive(),
    email: z.email(),
    role: z.enum(["admin", "user"]),
    customField: z.string().min(5, { message: "Custom length requirement" }),
  });

  const pipe = new ZodValidationPipe(testSchema);

  it("should pass through valid payloads", () => {
    const validData = {
      name: "Ngoc",
      age: 25,
      email: "test@greenroots.farm",
      role: "admin",
      customField: "valid_custom",
    };

    const result = pipe.transform(validData);
    expect(result).toEqual(validData);
  });

  it("should format missing required fields with code REQUIRED and English reason", () => {
    try {
      pipe.transform({});
      expect().fail("Should have thrown BadRequestException");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const res = (error as BadRequestException).getResponse() as {
        code: string;
        detail: string;
        invalidParams: InvalidParam[];
      };
      expect(res.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
      expect(res.detail).toBe(MESSAGES.VALIDATION.INVALID_INPUT);

      const nameParam = res.invalidParams.find((p) => p.name === "name");
      expect(nameParam).toBeDefined();
      expect(nameParam?.code).toBe(API_ERROR_CODES.REQUIRED);
      expect(nameParam?.reason).toBe(MESSAGES.VALIDATION.REQUIRED);
    }
  });

  it("should format invalid enum values with code INVALID_VALUE and dynamic params", () => {
    try {
      pipe.transform({
        name: "Ngoc",
        age: 25,
        email: "test@greenroots.farm",
        role: "guest",
        customField: "valid_custom",
      });
      expect().fail("Should have thrown BadRequestException");
    } catch (error) {
      const res = (error as BadRequestException).getResponse() as {
        invalidParams: InvalidParam[];
      };
      const roleParam = res.invalidParams.find((p) => p.name === "role");
      expect(roleParam).toBeDefined();
      expect(roleParam?.code).toBe(API_ERROR_CODES.INVALID_VALUE);
      expect(roleParam?.reason).toContain(
        "Invalid value. Expected one of: admin, user",
      );
      expect(roleParam?.params?.["values"]).toEqual(["admin", "user"]);
    }
  });

  it("should format invalid email format with code INVALID_EMAIL", () => {
    try {
      pipe.transform({
        name: "Ngoc",
        age: 25,
        email: "not-an-email",
        role: "admin",
        customField: "valid_custom",
      });
      expect().fail("Should have thrown BadRequestException");
    } catch (error) {
      const res = (error as BadRequestException).getResponse() as {
        invalidParams: InvalidParam[];
      };
      const emailParam = res.invalidParams.find((p) => p.name === "email");
      expect(emailParam).toBeDefined();
      expect(emailParam?.code).toBe(API_ERROR_CODES.INVALID_EMAIL);
      expect(emailParam?.reason).toBe(MESSAGES.VALIDATION.INVALID_EMAIL);
    }
  });

  it("should format number boundaries with code TOO_SMALL and bounds metadata", () => {
    try {
      pipe.transform({
        name: "Ngoc",
        age: -5,
        email: "test@greenroots.farm",
        role: "admin",
        customField: "valid_custom",
      });
      expect().fail("Should have thrown BadRequestException");
    } catch (error) {
      const res = (error as BadRequestException).getResponse() as {
        invalidParams: InvalidParam[];
      };
      const ageParam = res.invalidParams.find((p) => p.name === "age");
      expect(ageParam).toBeDefined();
      expect(ageParam?.code).toBe(API_ERROR_CODES.TOO_SMALL);
      expect(ageParam?.reason).toContain("Number must be greater than 0");
      expect(ageParam?.params).toEqual({
        origin: "number",
        minimum: 0,
        inclusive: false,
      });
    }
  });

  it("should preserve developer-supplied custom messages on schema fields", () => {
    try {
      pipe.transform({
        name: "Ngoc",
        age: 25,
        email: "test@greenroots.farm",
        role: "admin",
        customField: "abc",
      });
      expect().fail("Should have thrown BadRequestException");
    } catch (error) {
      const res = (error as BadRequestException).getResponse() as {
        invalidParams: InvalidParam[];
      };
      const customParam = res.invalidParams.find(
        (p) => p.name === "customField",
      );
      expect(customParam).toBeDefined();
      expect(customParam?.code).toBe(API_ERROR_CODES.CUSTOM_VALIDATION_ERROR);
      expect(customParam?.reason).toBe("Custom length requirement");
    }
  });

  it("should format nested issue paths correctly", () => {
    expect(formatZodIssuePath(["items", 0, "price"])).toBe("items[0].price");
    expect(formatZodIssuePath(["user", "address", "city"])).toBe(
      "user.address.city",
    );
    expect(formatZodIssuePath([])).toBe("");
  });

  it("maps explicit domain validation code messages to the error code and English reason", () => {
    const shippingPipe = new ZodValidationPipe(
      z
        .object({
          maxRadiusKm: z.number(),
          subscriptionFreeRadiusKm: z.number(),
        })
        .superRefine((data, ctx) => {
          if (data.subscriptionFreeRadiusKm > data.maxRadiusKm) {
            ctx.addIssue({
              code: "custom",
              path: ["subscriptionFreeRadiusKm"],
              message:
                API_ERROR_CODES.FARM_SHIPPING_SUBSCRIPTION_RADIUS_INVALID,
            });
          }
        }),
    );

    try {
      shippingPipe.transform({ maxRadiusKm: 20, subscriptionFreeRadiusKm: 25 });
      expect().fail("Should have thrown BadRequestException");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const res = (error as BadRequestException).getResponse() as {
        code: string;
        invalidParams: InvalidParam[];
      };
      expect(res.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
      expect(res.invalidParams).toEqual([
        {
          name: "subscriptionFreeRadiusKm",
          code: API_ERROR_CODES.FARM_SHIPPING_SUBSCRIPTION_RADIUS_INVALID,
          reason: MESSAGES.VALIDATION.FARM_SHIPPING_SUBSCRIPTION_RADIUS_INVALID,
          params: undefined,
        },
      ]);
    }
  });
});

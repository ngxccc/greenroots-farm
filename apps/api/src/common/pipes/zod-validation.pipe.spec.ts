import { describe, expect, it } from "bun:test";
import { BadRequestException } from "@nestjs/common";
import { z } from "zod";
import { MESSAGES } from "@/common/constants/messages.constant";
import { formatZodIssuePath, ZodValidationPipe } from "./zod-validation.pipe";

describe("ZodValidationPipe", () => {
  const testSchema = z.object({
    name: z.string().min(3),
    age: z.number().int().positive(),
    email: z.email(),
    role: z.enum(["admin", "user"]),
    customField: z.string().min(5, { message: "Tùy biến: Tối thiểu 5 ký tự" }),
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

  it("should format missing required fields as localized required message", () => {
    try {
      pipe.transform({});
      expect().fail("Should have thrown BadRequestException");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const res = (error as BadRequestException).getResponse() as {
        detail: string;
        invalidParams: { name: string; reason: string }[];
      };
      expect(res.detail).toBe(MESSAGES.VALIDATION.INVALID_INPUT);
      const nameParam = res.invalidParams.find((p) => p.name === "name");
      expect(nameParam?.reason).toBe(MESSAGES.VALIDATION.REQUIRED);
    }
  });

  it("should format invalid enum values in Vietnamese", () => {
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
        invalidParams: { name: string; reason: string }[];
      };
      const roleParam = res.invalidParams.find((p) => p.name === "role");
      expect(roleParam?.reason).toContain(
        "Giá trị không hợp lệ. Phải là một trong: admin, user",
      );
    }
  });

  it("should format invalid email format in Vietnamese", () => {
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
        invalidParams: { name: string; reason: string }[];
      };
      const emailParam = res.invalidParams.find((p) => p.name === "email");
      expect(emailParam?.reason).toBe(MESSAGES.VALIDATION.INVALID_EMAIL);
    }
  });

  it("should format number boundaries in Vietnamese", () => {
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
        invalidParams: { name: string; reason: string }[];
      };
      const ageParam = res.invalidParams.find((p) => p.name === "age");
      expect(ageParam?.reason).toContain("Giá trị phải lớn hơn 0");
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
        invalidParams: { name: string; reason: string }[];
      };
      const customParam = res.invalidParams.find(
        (p) => p.name === "customField",
      );
      expect(customParam?.reason).toBe("Tùy biến: Tối thiểu 5 ký tự");
    }
  });

  it("should format nested issue paths correctly", () => {
    expect(formatZodIssuePath(["items", 0, "price"])).toBe("items[0].price");
    expect(formatZodIssuePath(["user", "address", "city"])).toBe(
      "user.address.city",
    );
    expect(formatZodIssuePath([])).toBe("");
  });
});

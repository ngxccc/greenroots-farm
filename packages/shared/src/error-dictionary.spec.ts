import { describe, expect, it } from "bun:test";
import { BUSINESS_RULES } from "./business.constants";
import { OrderStatus, PaymentStatus } from "./domain.enums";
import {
  API_ERROR_CODES,
  API_ERROR_DICTIONARY,
  resolveSharedApiErrorMessage,
} from "./error-dictionary";
import { ORDER_STATUS_LABELS } from "./shared-labels";

describe("BUSINESS_RULES", () => {
  it("defines the 150,000 VND minimum order value constant", () => {
    expect(BUSINESS_RULES.MIN_ORDER_VALUE_VND).toBe(150_000);
  });
});

describe("OrderStatus & PaymentStatus", () => {
  it("exposes confirmed order status with Vietnamese label and cancelled payment status", () => {
    expect(OrderStatus.CONFIRMED).toBe("confirmed");
    expect(ORDER_STATUS_LABELS[OrderStatus.CONFIRMED]).toBe("Đã xác nhận");
    expect(PaymentStatus.CANCELLED).toBe("cancelled");
  });
});

describe("API_ERROR_DICTIONARY", () => {
  it("provides a non-empty Vietnamese message for every API_ERROR_CODES member", () => {
    const codes = Object.values(API_ERROR_CODES);

    expect(Object.keys(API_ERROR_DICTIONARY).sort()).toEqual([...codes].sort());

    for (const code of codes) {
      const message = API_ERROR_DICTIONARY[code];
      expect(typeof message).toBe("string");
      expect(message.trim().length).toBeGreaterThan(0);
    }

    expect(
      API_ERROR_DICTIONARY[API_ERROR_CODES.OUT_OF_DELIVERY_RADIUS],
    ).not.toContain("25 km");
  });
});

describe("resolveSharedApiErrorMessage", () => {
  it("returns the mapped dictionary message when no interpolation params apply", () => {
    expect(resolveSharedApiErrorMessage(API_ERROR_CODES.FORBIDDEN)).toBe(
      API_ERROR_DICTIONARY[API_ERROR_CODES.FORBIDDEN],
    );
    expect(resolveSharedApiErrorMessage(API_ERROR_CODES.ORDER_NOT_FOUND)).toBe(
      API_ERROR_DICTIONARY[API_ERROR_CODES.ORDER_NOT_FOUND],
    );
    expect(
      resolveSharedApiErrorMessage(
        API_ERROR_CODES.ORDER_PICK_LIST_STATUS_INVALID,
      ),
    ).toBe(
      API_ERROR_DICTIONARY[API_ERROR_CODES.ORDER_PICK_LIST_STATUS_INVALID],
    );
    expect(
      resolveSharedApiErrorMessage(
        API_ERROR_CODES.ORDER_ACTIVE_ALLOCATIONS_MISSING,
      ),
    ).toBe(
      API_ERROR_DICTIONARY[API_ERROR_CODES.ORDER_ACTIVE_ALLOCATIONS_MISSING],
    );
    expect(
      resolveSharedApiErrorMessage(
        API_ERROR_CODES.FARM_SHIPPING_SUBSCRIPTION_RADIUS_INVALID,
      ),
    ).toBe(
      API_ERROR_DICTIONARY[
        API_ERROR_CODES.FARM_SHIPPING_SUBSCRIPTION_RADIUS_INVALID
      ],
    );
    expect(
      resolveSharedApiErrorMessage(
        API_ERROR_CODES.FARM_SHIPPING_FREE_THRESHOLD_INVALID,
      ),
    ).toBe(
      API_ERROR_DICTIONARY[
        API_ERROR_CODES.FARM_SHIPPING_FREE_THRESHOLD_INVALID
      ],
    );
  });

  it("interpolates minimum constraints for TOO_SMALL across string, number, and array origins", () => {
    expect(
      resolveSharedApiErrorMessage(API_ERROR_CODES.TOO_SMALL, {
        origin: "string",
        minimum: 8,
      }),
    ).toBe("Độ dài tối thiểu là 8 ký tự.");

    expect(
      resolveSharedApiErrorMessage(API_ERROR_CODES.TOO_SMALL, {
        origin: "number",
        minimum: 1,
      }),
    ).toBe("Giá trị phải lớn hơn hoặc bằng 1.");

    expect(
      resolveSharedApiErrorMessage(API_ERROR_CODES.TOO_SMALL, {
        origin: "array",
        minimum: 2,
      }),
    ).toBe("Danh sách phải có tối thiểu 2 phần tử.");
  });

  it("interpolates maximum constraints for TOO_BIG across string, number, and array origins", () => {
    expect(
      resolveSharedApiErrorMessage(API_ERROR_CODES.TOO_BIG, {
        origin: "string",
        maximum: 100,
      }),
    ).toBe("Độ dài tối đa là 100 ký tự.");

    expect(
      resolveSharedApiErrorMessage(API_ERROR_CODES.TOO_BIG, {
        origin: "number",
        maximum: 50,
      }),
    ).toBe("Giá trị phải nhỏ hơn hoặc bằng 50.");

    expect(
      resolveSharedApiErrorMessage(API_ERROR_CODES.TOO_BIG, {
        origin: "array",
        maximum: 5,
      }),
    ).toBe("Danh sách tối đa 5 phần tử.");
  });

  it("interpolates minOrderValueVnd for ORDER_BELOW_MINIMUM_VALUE", () => {
    expect(
      resolveSharedApiErrorMessage(API_ERROR_CODES.ORDER_BELOW_MINIMUM_VALUE, {
        minOrderValueVnd: 150_000,
      }),
    ).toContain("150.000");
  });

  it("falls back to detail string or NETWORK_ERROR when error code is unknown or absent", () => {
    expect(
      resolveSharedApiErrorMessage("UNKNOWN_CODE", "Custom fallback detail"),
    ).toBe("Custom fallback detail");

    expect(
      resolveSharedApiErrorMessage(
        "UNKNOWN_CODE",
        { extra: true },
        "Param-mode fallback detail",
      ),
    ).toBe("Param-mode fallback detail");

    expect(resolveSharedApiErrorMessage(undefined, "")).toBe(
      API_ERROR_DICTIONARY[API_ERROR_CODES.NETWORK_ERROR],
    );
  });
});

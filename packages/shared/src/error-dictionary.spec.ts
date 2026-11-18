import { describe, expect, it } from "bun:test";
import {
  API_ERROR_CODES,
  API_ERROR_DICTIONARY,
  resolveSharedApiErrorMessage,
} from "./error-dictionary";

describe("error-dictionary", () => {
  it("defines standard machine error codes", () => {
    expect(API_ERROR_CODES.VALIDATION_FAILED).toBe("VALIDATION_FAILED");
    expect(API_ERROR_CODES.REQUIRED).toBe("REQUIRED");
    expect(API_ERROR_CODES.INVALID_EMAIL).toBe("INVALID_EMAIL");
    expect(API_ERROR_CODES.TOO_MANY_REQUESTS).toBe("TOO_MANY_REQUESTS");
    expect(API_ERROR_CODES.INSUFFICIENT_STOCK).toBe("INSUFFICIENT_STOCK");
    expect(API_ERROR_CODES.AUTH_EMAIL_NOT_VERIFIED).toBe(
      "AUTH_EMAIL_NOT_VERIFIED",
    );
    expect(API_ERROR_CODES.AUTH_EMAIL_ALREADY_EXISTS).toBe(
      "AUTH_EMAIL_ALREADY_EXISTS",
    );
    expect(API_ERROR_CODES.AUTH_VERIFICATION_TOKEN_INVALID).toBe(
      "AUTH_VERIFICATION_TOKEN_INVALID",
    );
    expect(API_ERROR_CODES.AUTH_RESET_TOKEN_INVALID).toBe(
      "AUTH_RESET_TOKEN_INVALID",
    );
  });

  it("maps all error codes to a Vietnamese localized message", () => {
    for (const code of Object.values(API_ERROR_CODES)) {
      expect(API_ERROR_DICTIONARY[code]).toBeDefined();
      expect(API_ERROR_DICTIONARY[code].length).toBeGreaterThan(0);
    }
  });

  it("resolves static messages when no params are supplied", () => {
    const message = resolveSharedApiErrorMessage(API_ERROR_CODES.REQUIRED);
    expect(message).toBe(API_ERROR_DICTIONARY[API_ERROR_CODES.REQUIRED]);
  });

  it("interpolates dynamic parameters for TOO_SMALL", () => {
    const stringMin = resolveSharedApiErrorMessage(API_ERROR_CODES.TOO_SMALL, {
      origin: "string",
      minimum: 8,
    });
    expect(stringMin).toBe("Độ dài tối thiểu là 8 ký tự.");

    const numberMin = resolveSharedApiErrorMessage(API_ERROR_CODES.TOO_SMALL, {
      origin: "number",
      minimum: 10,
    });
    expect(numberMin).toBe("Giá trị phải lớn hơn hoặc bằng 10.");

    const arrayMin = resolveSharedApiErrorMessage(API_ERROR_CODES.TOO_SMALL, {
      origin: "array",
      minimum: 1,
    });
    expect(arrayMin).toBe("Danh sách phải có tối thiểu 1 phần tử.");
  });

  it("interpolates dynamic parameters for TOO_BIG", () => {
    const stringMax = resolveSharedApiErrorMessage(API_ERROR_CODES.TOO_BIG, {
      origin: "string",
      maximum: 100,
    });
    expect(stringMax).toBe("Độ dài tối đa là 100 ký tự.");

    const numberMax = resolveSharedApiErrorMessage(API_ERROR_CODES.TOO_BIG, {
      origin: "number",
      maximum: 50,
    });
    expect(numberMax).toBe("Giá trị phải nhỏ hơn hoặc bằng 50.");
  });

  it("falls back to detail or NETWORK_ERROR for unknown codes", () => {
    expect(
      resolveSharedApiErrorMessage(
        "UNKNOWN_CODE",
        undefined,
        "Custom fallback",
      ),
    ).toBe("Custom fallback");

    expect(resolveSharedApiErrorMessage(undefined, undefined, undefined)).toBe(
      API_ERROR_DICTIONARY[API_ERROR_CODES.NETWORK_ERROR],
    );
  });
});

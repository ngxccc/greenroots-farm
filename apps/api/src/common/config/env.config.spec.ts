import { describe, expect, it } from "bun:test";
import { parseApiEnvironment } from "./env.config";

const PROD_BASE_ENV = {
  NODE_ENV: "production",
  JWT_ACCESS_SECRET: "prod-jwt-access-secret-at-least-32-chars",
  CLOUDINARY_CLOUD_NAME: "prod-cloud",
  CLOUDINARY_API_KEY: "prod-key",
  CLOUDINARY_API_SECRET: "prod-secret",
  STOREFRONT_URL: "https://greenroots.farm",
} as const;

describe("parseApiEnvironment", () => {
  it("defaults Cloudinary dev values and STOREFRONT_URL in non-production environments", () => {
    const devEnv = parseApiEnvironment({ NODE_ENV: "development" });
    expect(devEnv.CLOUDINARY_CLOUD_NAME).toBe("greenroots-dev");
    expect(devEnv.CLOUDINARY_API_KEY).toBe("mock-api-key");
    expect(devEnv.STOREFRONT_URL).toBe("http://localhost:3001");

    const testEnv = parseApiEnvironment({ NODE_ENV: "test" });
    expect(testEnv.CLOUDINARY_CLOUD_NAME).toBe("greenroots-dev");
    expect(testEnv.CLOUDINARY_API_KEY).toBe("mock-api-key");
    expect(testEnv.STOREFRONT_URL).toBe("http://localhost:3001");
  });

  it("fails fast in production when JWT_ACCESS_SECRET is missing or uses the dev default", () => {
    expect(() =>
      parseApiEnvironment({
        ...PROD_BASE_ENV,
        JWT_ACCESS_SECRET: undefined,
      }),
    ).toThrow(/JWT_ACCESS_SECRET/);

    expect(() =>
      parseApiEnvironment({
        ...PROD_BASE_ENV,
        JWT_ACCESS_SECRET: "greenroots-dev-access-secret-min-32-chars",
      }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it("fails fast in production when MAIL_DRIVER is resend without RESEND_API_KEY", () => {
    expect(() =>
      parseApiEnvironment({
        ...PROD_BASE_ENV,
        MAIL_DRIVER: "resend",
      }),
    ).toThrow(/RESEND_API_KEY/);
  });

  it("fails fast in production when SHIPPING_DRIVER requires missing provider API keys", () => {
    // Invariant: INV-GEO-2
    expect(() =>
      parseApiEnvironment({
        ...PROD_BASE_ENV,
        SHIPPING_DRIVER: "goong",
      }),
    ).toThrow(/GOONG_API_KEY/);

    expect(() =>
      parseApiEnvironment({
        ...PROD_BASE_ENV,
        SHIPPING_DRIVER: "vietmap",
      }),
    ).toThrow(/VIETMAP_API_KEY/);
  });

  it("fails fast in production when PAYMENT_DRIVER is payos without PayOS credentials", () => {
    // Invariant: INV-PAY-1
    expect(() =>
      parseApiEnvironment({
        ...PROD_BASE_ENV,
        PAYMENT_DRIVER: "payos",
        PAYOS_API_KEY: "payos-api-key",
        PAYOS_CHECKSUM_KEY: "payos-checksum-key",
      }),
    ).toThrow(/PAYOS_CLIENT_ID/);

    expect(() =>
      parseApiEnvironment({
        ...PROD_BASE_ENV,
        PAYMENT_DRIVER: "payos",
        PAYOS_CLIENT_ID: "payos-client-id",
        PAYOS_CHECKSUM_KEY: "payos-checksum-key",
      }),
    ).toThrow(/PAYOS_API_KEY/);

    expect(() =>
      parseApiEnvironment({
        ...PROD_BASE_ENV,
        PAYMENT_DRIVER: "payos",
        PAYOS_CLIENT_ID: "payos-client-id",
        PAYOS_API_KEY: "payos-api-key",
        PAYOS_CHECKSUM_KEY: "   ",
      }),
    ).toThrow(/PAYOS_CHECKSUM_KEY/);
  });

  it("fails fast in production when Cloudinary credentials are missing", () => {
    expect(() =>
      parseApiEnvironment({
        ...PROD_BASE_ENV,
        CLOUDINARY_CLOUD_NAME: undefined,
      }),
    ).toThrow(/CLOUDINARY_CLOUD_NAME/);

    expect(() =>
      parseApiEnvironment({
        ...PROD_BASE_ENV,
        CLOUDINARY_API_KEY: undefined,
      }),
    ).toThrow(/CLOUDINARY_API_KEY/);

    expect(() =>
      parseApiEnvironment({
        ...PROD_BASE_ENV,
        CLOUDINARY_API_SECRET: undefined,
      }),
    ).toThrow(/CLOUDINARY_API_SECRET/);
  });

  it("normalizes trailing slashes and rejects non-origin STOREFRONT_URL values", () => {
    const devEnv = parseApiEnvironment({
      NODE_ENV: "development",
      STOREFRONT_URL: "http://localhost:3001/",
    });
    expect(devEnv.STOREFRONT_URL).toBe("http://localhost:3001");

    for (const invalidUrl of [
      "https://greenroots.farm/shop",
      "https://greenroots.farm?foo=bar",
      "https://greenroots.farm#top",
      "https://user:pass@greenroots.farm",
      "ftp://greenroots.farm",
    ]) {
      expect(() =>
        parseApiEnvironment({
          NODE_ENV: "development",
          STOREFRONT_URL: invalidUrl,
        }),
      ).toThrow(/STOREFRONT_URL/);
    }
  });

  it("fails fast in production when STOREFRONT_URL is missing, non-HTTPS, or loopback", () => {
    // Invariant: INV-QR-LABEL-1
    expect(() =>
      parseApiEnvironment({
        ...PROD_BASE_ENV,
        STOREFRONT_URL: undefined,
      }),
    ).toThrow(/STOREFRONT_URL/);

    expect(() =>
      parseApiEnvironment({
        ...PROD_BASE_ENV,
        STOREFRONT_URL: "http://greenroots.farm",
      }),
    ).toThrow(/STOREFRONT_URL/);

    for (const loopbackUrl of [
      "https://localhost:3001",
      "https://sub.localhost:3001",
      "https://127.0.0.1:3001",
      "https://[::1]:3001",
      "https://0.0.0.0:3001",
    ]) {
      expect(() =>
        parseApiEnvironment({
          ...PROD_BASE_ENV,
          STOREFRONT_URL: loopbackUrl,
        }),
      ).toThrow(/STOREFRONT_URL/);
    }
  });

  it("accepts production configuration when required secrets and credentials are provided", () => {
    const prodEnv = parseApiEnvironment({
      ...PROD_BASE_ENV,
      STOREFRONT_URL: "https://greenroots.farm/",
      MAIL_DRIVER: "resend",
      RESEND_API_KEY: "re_prod_123456",
      PAYMENT_DRIVER: "payos",
      PAYOS_CLIENT_ID: "payos-client-id",
      PAYOS_API_KEY: "payos-api-key",
      PAYOS_CHECKSUM_KEY: "payos-checksum-key",
    });
    expect(prodEnv.CLOUDINARY_CLOUD_NAME).toBe("prod-cloud");
    expect(prodEnv.CLOUDINARY_API_KEY).toBe("prod-key");
    expect(prodEnv.CLOUDINARY_API_SECRET).toBe("prod-secret");
    expect(prodEnv.RESEND_API_KEY).toBe("re_prod_123456");
    expect(prodEnv.PAYOS_CLIENT_ID).toBe("payos-client-id");
    expect(prodEnv.PAYOS_API_KEY).toBe("payos-api-key");
    expect(prodEnv.PAYOS_CHECKSUM_KEY).toBe("payos-checksum-key");
    expect(prodEnv.STOREFRONT_URL).toBe("https://greenroots.farm");
  });
});

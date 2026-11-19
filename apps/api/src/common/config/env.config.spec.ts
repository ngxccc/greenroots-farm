import { describe, expect, it } from "bun:test";
import { parseApiEnvironment } from "./env.config";

const PROD_BASE_ENV = {
  NODE_ENV: "production",
  JWT_ACCESS_SECRET: "prod-jwt-access-secret-at-least-32-chars",
  CLOUDINARY_CLOUD_NAME: "prod-cloud",
  CLOUDINARY_API_KEY: "prod-key",
  CLOUDINARY_API_SECRET: "prod-secret",
} as const;

describe("parseApiEnvironment", () => {
  it("defaults Cloudinary dev values in non-production environments", () => {
    const devEnv = parseApiEnvironment({ NODE_ENV: "development" });
    expect(devEnv.CLOUDINARY_CLOUD_NAME).toBe("greenroots-dev");
    expect(devEnv.CLOUDINARY_API_KEY).toBe("mock-api-key");

    const testEnv = parseApiEnvironment({ NODE_ENV: "test" });
    expect(testEnv.CLOUDINARY_CLOUD_NAME).toBe("greenroots-dev");
    expect(testEnv.CLOUDINARY_API_KEY).toBe("mock-api-key");
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

  it("accepts production configuration when required secrets and credentials are provided", () => {
    const prodEnv = parseApiEnvironment({
      ...PROD_BASE_ENV,
      MAIL_DRIVER: "resend",
      RESEND_API_KEY: "re_prod_123456",
    });
    expect(prodEnv.CLOUDINARY_CLOUD_NAME).toBe("prod-cloud");
    expect(prodEnv.CLOUDINARY_API_KEY).toBe("prod-key");
    expect(prodEnv.CLOUDINARY_API_SECRET).toBe("prod-secret");
    expect(prodEnv.RESEND_API_KEY).toBe("re_prod_123456");
  });
});

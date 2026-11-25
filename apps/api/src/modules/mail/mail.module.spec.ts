import { describe, expect, it } from "bun:test";
import { MockMailDriver } from "./drivers/mock-mail.driver";
import { ResendMailDriver } from "./drivers/resend-mail.driver";
import { resolveMailDriver } from "./mail.module";

describe("MailModule", () => {
  const mock = new MockMailDriver();
  const resend = new ResendMailDriver();

  describe("resolveMailDriver", () => {
    it("selects MockMailDriver when NODE_ENV is test even if MAIL_DRIVER is resend", () => {
      // Invariant: INV-PAY-7
      const driver = resolveMailDriver(
        {
          NODE_ENV: "test",
          MAIL_DRIVER: "resend",
          RESEND_API_KEY: undefined,
        },
        mock,
        resend,
      );

      expect(driver).toBe(mock);
    });

    it("selects ResendMailDriver when MAIL_DRIVER is resend with RESEND_API_KEY in non-test", () => {
      // Invariant: INV-PAY-7
      const driver = resolveMailDriver(
        {
          NODE_ENV: "development",
          MAIL_DRIVER: "resend",
          RESEND_API_KEY: "re_dev_123",
        },
        mock,
        resend,
      );

      expect(driver).toBe(resend);
    });

    it("throws when MAIL_DRIVER is resend without RESEND_API_KEY in non-test", () => {
      // Invariant: INV-PAY-7
      expect(() =>
        resolveMailDriver(
          {
            NODE_ENV: "development",
            MAIL_DRIVER: "resend",
            RESEND_API_KEY: undefined,
          },
          mock,
          resend,
        ),
      ).toThrow(/RESEND_API_KEY/);
    });
  });
});

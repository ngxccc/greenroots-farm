import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { type INestApplication } from "@nestjs/common";
import {
  createTestApp,
  teardownTestApp,
  type TestAppSetup,
} from "../helpers/app.helper";
import { MailService } from "@/modules/mail/mail.service";
import { MailProcessor } from "@/modules/mail/mail.processor";
import { MockMailDriver } from "@/modules/mail/drivers/mock-mail.driver";
import { SEND_MAIL_JOB } from "@/modules/mail/mail.constant";
import type { Job } from "bullmq";
describe("Mail Queue BullMQ E2E Integration", () => {
  let setup: TestAppSetup;
  let app: INestApplication;
  let mailService: MailService;
  let mailProcessor: MailProcessor;
  let mockDriver: MockMailDriver;

  beforeAll(async () => {
    setup = await createTestApp();
    app = setup.app;
    mailService = app.get(MailService);
    mailProcessor = app.get(MailProcessor);
    mockDriver = app.get(MockMailDriver);
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(setup);
  });

  describe("Job Enqueueing & Delivery", () => {
    it("should enqueue verification email and dispatch via mail processor worker", async () => {
      mockDriver.clear();

      await mailService.sendVerificationEmail(
        "farmer@greenroots.farm",
        "Nguyen Van A",
        "test-verification-token-12345",
      );

      const mockJob = {
        id: "job-verification-1",
        name: SEND_MAIL_JOB,
        data: {
          to: "farmer@greenroots.farm",
          subject: "Xác thực tài khoản - GreenRoots Farm",
          html: "<p>Token: test-verification-token-12345</p>",
        },
      } as unknown as Job;

      await mailProcessor.process(mockJob);

      const sent = mockDriver.getSentEmails();
      expect(sent.length).toBeGreaterThan(0);
      const email = sent.find((e) =>
        String(e.to).includes("farmer@greenroots.farm"),
      );
      expect(email).toBeDefined();
      expect(email?.subject).toContain("Xác thực tài khoản");
      expect(email?.html).toContain("test-verification-token-12345");
    });

    it("should enqueue password reset email and deliver via mail processor worker", async () => {
      mockDriver.clear();

      await mailService.sendPasswordResetEmail(
        "customer@greenroots.farm",
        "Tran Thi B",
        "reset-token-xyz-987",
      );

      const mockJob = {
        id: "job-reset-1",
        name: SEND_MAIL_JOB,
        data: {
          to: "customer@greenroots.farm",
          subject: "Yêu cầu đặt lại mật khẩu - GreenRoots Farm",
          html: "<p>Token: reset-token-xyz-987</p>",
        },
      } as unknown as Job;

      await mailProcessor.process(mockJob);

      const sent = mockDriver.getSentEmails();
      expect(sent.length).toBeGreaterThan(0);
      const email = sent.find((e) =>
        String(e.to).includes("customer@greenroots.farm"),
      );
      expect(email).toBeDefined();
      expect(email?.subject).toContain("đặt lại mật khẩu");
      expect(email?.html).toContain("reset-token-xyz-987");
    });
  });
});

import { describe, expect, it, beforeEach } from "bun:test";
import { MailService } from "./mail.service";
import { MailProcessor } from "./mail.processor";
import { MockMailDriver } from "./drivers/mock-mail.driver";
import { MAIL_QUEUE_NAME, SEND_MAIL_JOB } from "./mail.constant";
import type { SendEmailPayload } from "./mail.interface";
import type { Job, Queue } from "bullmq";

describe("Mail Module Integration", () => {
  let mockDriver: MockMailDriver;
  let addedJobs: {
    name: string;
    data: SendEmailPayload;
    opts?: unknown;
  }[];
  let fakeQueue: Partial<Queue<SendEmailPayload>>;
  let mailService: MailService;
  let processor: MailProcessor;

  beforeEach(() => {
    mockDriver = new MockMailDriver();
    addedJobs = [];

    fakeQueue = {
      name: MAIL_QUEUE_NAME,
      add: (name: string, data: SendEmailPayload, opts?: unknown) => {
        addedJobs.push({ name, data, opts });
        return Promise.resolve({
          id: "job-test-1",
          name,
          data,
        } as unknown as Job<SendEmailPayload>);
      },
    };

    mailService = new MailService(fakeQueue as Queue<SendEmailPayload>);
    processor = new MailProcessor(mockDriver);
  });

  describe("MailService Producer", () => {
    it("should enqueue a generic mail job with retry configuration", async () => {
      const payload: SendEmailPayload = {
        to: "customer@greenroots.farm",
        subject: "Order Confirmation",
        html: "<p>Thank you for ordering</p>",
      };

      await mailService.sendMail(payload);

      expect(addedJobs).toHaveLength(1);
      expect(addedJobs[0]?.name).toBe(SEND_MAIL_JOB);
      expect(addedJobs[0]?.data.to).toBe("customer@greenroots.farm");
      expect(addedJobs[0]?.data.subject).toBe("Order Confirmation");
      expect(addedJobs[0]?.opts).toMatchObject({
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
      });
    });

    it("should enqueue verification email with confirmation link", async () => {
      await mailService.sendVerificationEmail(
        "ngoc@greenroots.farm",
        "Ngoc Tran",
        "verify-token-123",
      );

      expect(addedJobs).toHaveLength(1);
      const job = addedJobs[0];
      expect(job?.data.to).toBe("ngoc@greenroots.farm");
      expect(job?.data.subject).toContain("Xác thực tài khoản");
      expect(job?.data.html).toContain("verify-token-123");
    });

    it("should enqueue password reset email with recovery link", async () => {
      await mailService.sendPasswordResetEmail(
        "admin@greenroots.farm",
        "Admin",
        "reset-token-456",
      );

      expect(addedJobs).toHaveLength(1);
      const job = addedJobs[0];
      expect(job?.data.to).toBe("admin@greenroots.farm");
      expect(job?.data.subject).toContain("đặt lại mật khẩu");
      expect(job?.data.html).toContain("reset-token-456");
    });

    it("enqueues staff invitation email pointing to backoffice with 24h copy", async () => {
      await mailService.sendStaffInvitationEmail(
        "newstaff@greenroots.farm",
        "New Staff",
        "invite-token-789",
      );

      expect(addedJobs).toHaveLength(1);
      const job = addedJobs[0];
      expect(job?.data.to).toBe("newstaff@greenroots.farm");
      expect(job?.data.subject).toContain("kích hoạt tài khoản nhân viên");
      expect(job?.data.html).toContain(
        "http://localhost:3002/reset-password?token=invite-token-789",
      );
      expect(job?.data.html).toContain("24 giờ");
    });

    it("enqueues staff credential reset email pointing to backoffice with 24h copy", async () => {
      await mailService.sendStaffCredentialResetEmail(
        "staff@greenroots.farm",
        "Staff Member",
        "staff-reset-999",
      );

      expect(addedJobs).toHaveLength(1);
      const job = addedJobs[0];
      expect(job?.data.to).toBe("staff@greenroots.farm");
      expect(job?.data.subject).toContain("Đặt lại thông tin đăng nhập");
      expect(job?.data.html).toContain(
        "http://localhost:3002/reset-password?token=staff-reset-999",
      );
      expect(job?.data.html).toContain("24 giờ");
    });
  });

  describe("MailProcessor and MockMailDriver Consumer", () => {
    it("should process mail job and capture payload into MockMailDriver", async () => {
      const payload: SendEmailPayload = {
        to: "recipient@example.com",
        subject: "Test email",
        html: "<p>Hello</p>",
      };

      const fakeJob = {
        id: "job-99",
        name: SEND_MAIL_JOB,
        data: payload,
      } as Job<SendEmailPayload>;

      const result = await processor.process(fakeJob);

      expect(result).toBeDefined();
      expect(result?.messageId).toContain("mock-");
      expect(mockDriver.sentEmails).toHaveLength(1);
      expect(mockDriver.sentEmails[0]?.to).toBe("recipient@example.com");
      expect(mockDriver.sentEmails[0]?.subject).toBe("Test email");
    });

    it("should ignore unknown job names without processing", async () => {
      const fakeJob = {
        id: "job-100",
        name: "unknown-job-type",
        data: { to: "ignore@example.com", subject: "None", html: "" },
      } as Job<SendEmailPayload>;

      const result = await processor.process(fakeJob);

      expect(result).toBeUndefined();
      expect(mockDriver.sentEmails).toHaveLength(0);
    });
  });
});

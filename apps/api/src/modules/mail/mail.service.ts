import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { env } from "@/common/config/env.config";
import { MAIL_QUEUE_NAME, SEND_MAIL_JOB } from "./mail.constant";
import type { SendEmailPayload } from "./mail.interface";

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    @InjectQueue(MAIL_QUEUE_NAME)
    private readonly mailQueue: Queue<SendEmailPayload>,
  ) {}

  /**
   * Enqueues an email for asynchronous delivery via BullMQ.
   */
  async sendMail(payload: SendEmailPayload): Promise<void> {
    await this.mailQueue.add(SEND_MAIL_JOB, payload, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });

    this.logger.log(
      `Enqueued email job "${SEND_MAIL_JOB}" to "${String(payload.to)}" (Subject: "${payload.subject}")`,
    );
  }

  /**
   * Enqueues an account email verification message.
   */
  async sendVerificationEmail(
    to: string,
    fullName: string,
    token: string,
  ): Promise<void> {
    const verifyUrl = `${env.STOREFRONT_URL}/verify-email?token=${token}`;
    const subject = "Xác thực tài khoản - GreenRoots Farm";
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2e7d32;">Chào mừng bạn đến với GreenRoots Farm!</h2>
        <p>Xin chào <strong>${fullName}</strong>,</p>
        <p>Cảm ơn bạn đã đăng ký tài khoản. Vui lòng nhấn vào nút bên dưới để xác thực địa chỉ email:</p>
        <div style="margin: 30px 0;">
          <a href="${verifyUrl}" style="background-color: #2e7d32; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            Xác thực email ngay
          </a>
        </div>
        <p style="color: #666; font-size: 13px;">Liên kết này có hiệu lực trong 24 giờ. Nếu bạn không đăng ký tài khoản này, vui lòng bỏ qua email.</p>
      </div>
    `;

    await this.sendMail({
      to,
      subject,
      html,
      text: `Xin chào ${fullName}, vui lòng truy cập liên kết sau để xác thực tài khoản: ${verifyUrl}`,
    });
  }

  /**
   * Enqueues a password reset email.
   */
  async sendPasswordResetEmail(
    to: string,
    fullName: string,
    token: string,
  ): Promise<void> {
    const resetUrl = `${env.STOREFRONT_URL}/reset-password?token=${token}`;
    const subject = "Yêu cầu đặt lại mật khẩu - GreenRoots Farm";
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #d32f2f;">Yêu cầu đặt lại mật khẩu</h2>
        <p>Xin chào <strong>${fullName}</strong>,</p>
        <p>Hệ thống nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Nhấn vào nút bên dưới để tạo mật khẩu mới:</p>
        <div style="margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #2e7d32; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            Đặt lại mật khẩu
          </a>
        </div>
        <p style="color: #666; font-size: 13px;">Liên kết này có hiệu lực trong 15 phút. Nếu bạn không gửi yêu cầu này, hãy đổi mật khẩu ngay hoặc liên hệ hỗ trợ.</p>
      </div>
    `;

    await this.sendMail({
      to,
      subject,
      html,
      text: `Xin chào ${fullName}, vui lòng truy cập liên kết sau để đặt lại mật khẩu: ${resetUrl}`,
    });
  }

  private async sendStaffTokenEmail(params: {
    to: string;
    fullName: string;
    token: string;
    subject: string;
    heading: string;
    headingColor: string;
    introText: string;
    ctaLabel: string;
    plainTextPrefix: string;
  }): Promise<void> {
    const actionUrl = `${env.BACKOFFICE_URL}/reset-password?token=${params.token}`;
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: ${params.headingColor};">${params.heading}</h2>
        <p>Xin chào <strong>${params.fullName}</strong>,</p>
        <p>${params.introText}</p>
        <div style="margin: 30px 0;">
          <a href="${actionUrl}" style="background-color: #2e7d32; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            ${params.ctaLabel}
          </a>
        </div>
        <p style="color: #666; font-size: 13px;">Liên kết này có hiệu lực trong 24 giờ. Nếu bạn cần hỗ trợ, vui lòng liên hệ quản trị viên hệ thống.</p>
      </div>
    `;

    await this.sendMail({
      to: params.to,
      subject: params.subject,
      html,
      text: `Xin chào ${params.fullName}, ${params.plainTextPrefix}: ${actionUrl}`,
    });
  }

  /**
   * Enqueues a Backoffice staff onboarding invitation email with a 24-hour password-setup link.
   */
  async sendStaffInvitationEmail(
    to: string,
    fullName: string,
    token: string,
  ): Promise<void> {
    await this.sendStaffTokenEmail({
      to,
      fullName,
      token,
      subject: "Lời mời kích hoạt tài khoản nhân viên - GreenRoots Farm",
      heading: "Chào mừng gia nhập đội ngũ GreenRoots Farm",
      headingColor: "#2e7d32",
      introText:
        "Tài khoản quản trị nội bộ của bạn đã được tạo. Vui lòng nhấn vào nút bên dưới để thiết lập mật khẩu và kích hoạt đăng nhập:",
      ctaLabel: "Thiết lập mật khẩu Backoffice",
      plainTextPrefix:
        "vui lòng truy cập liên kết sau để thiết lập mật khẩu Backoffice",
    });
  }

  /**
   * Enqueues an administrator-initiated Backoffice credential reset email with a 24-hour link.
   */
  async sendStaffCredentialResetEmail(
    to: string,
    fullName: string,
    token: string,
  ): Promise<void> {
    await this.sendStaffTokenEmail({
      to,
      fullName,
      token,
      subject: "Đặt lại thông tin đăng nhập Backoffice - GreenRoots Farm",
      heading: "Yêu cầu đặt lại mật khẩu nhân viên",
      headingColor: "#d32f2f",
      introText:
        "Quản trị viên tối cao đã khởi tạo yêu cầu đặt lại mật khẩu cho tài khoản Backoffice của bạn. Nhấn vào nút bên dưới để đặt mật khẩu mới:",
      ctaLabel: "Đặt lại mật khẩu Backoffice",
      plainTextPrefix:
        "vui lòng truy cập liên kết sau để đặt lại mật khẩu Backoffice",
    });
  }
}

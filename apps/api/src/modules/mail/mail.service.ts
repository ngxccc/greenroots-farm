import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { env } from "@/common/config/env.config";
import {
  MAIL_QUEUE_NAME,
  SEND_MAIL_JOB,
  type SendEmailPayload,
} from "./mail.interface";

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
}

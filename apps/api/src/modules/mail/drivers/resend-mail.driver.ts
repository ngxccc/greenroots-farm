import { Injectable, Logger } from "@nestjs/common";
import { env } from "@/common/config/env.config";
import type {
  IMailDriver,
  SendEmailPayload,
  SendEmailResult,
} from "../mail.interface";

@Injectable()
export class ResendMailDriver implements IMailDriver {
  private readonly logger = new Logger(ResendMailDriver.name);
  private readonly apiUrl = "https://api.resend.com/emails";

  async send(payload: SendEmailPayload): Promise<SendEmailResult> {
    const apiKey = env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not configured.");
    }

    const recipients = Array.isArray(payload.to) ? payload.to : [payload.to];

    const body: Record<string, unknown> = {
      from: env.EMAIL_FROM,
      to: recipients,
      subject: payload.subject,
      html: payload.html,
    };

    if (payload.text) {
      body["text"] = payload.text;
    }
    if (payload.replyTo) {
      body["reply_to"] = payload.replyTo;
    }

    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(
        `Failed to send email via Resend [${response.status}]: ${errorText}`,
      );
      throw new Error(
        `Resend API request failed with status ${response.status}`,
      );
    }

    const data = (await response.json()) as { id?: string };
    const messageId = data.id ?? `resend-${Date.now()}`;

    this.logger.log(
      `Email sent via Resend to ${recipients.join(", ")} (ID: ${messageId})`,
    );

    return { messageId };
  }
}

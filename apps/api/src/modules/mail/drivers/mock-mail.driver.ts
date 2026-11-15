import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  IMailDriver,
  SendEmailPayload,
  SendEmailResult,
} from "../mail.interface";

@Injectable()
export class MockMailDriver implements IMailDriver {
  private readonly logger = new Logger(MockMailDriver.name);
  private sent: SendEmailPayload[] = [];

  send(payload: SendEmailPayload): Promise<SendEmailResult> {
    this.sent.push(payload);
    const messageId = `mock-${randomUUID()}`;
    this.logger.log(
      `[MockMailDriver] Sent email to "${String(payload.to)}" with subject "${payload.subject}" (ID: ${messageId})`,
    );
    return Promise.resolve({ messageId });
  }
  get sentEmails(): readonly SendEmailPayload[] {
    return this.sent;
  }

  getSentEmails(): readonly SendEmailPayload[] {
    return this.sent;
  }
  clear(): void {
    this.sent = [];
  }
}

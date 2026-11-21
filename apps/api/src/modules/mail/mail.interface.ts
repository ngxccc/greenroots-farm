/**
 * Input payload passed to an `IMailDriver` implementation for outbound email dispatch.
 */
export interface SendEmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

/**
 * Provider confirmation metadata returned after dispatching an email.
 */
export interface SendEmailResult {
  messageId: string;
}

/**
 * Contract for outbound email delivery adapters (Resend or mock driver).
 */
export interface IMailDriver {
  send(payload: SendEmailPayload): Promise<SendEmailResult>;
}

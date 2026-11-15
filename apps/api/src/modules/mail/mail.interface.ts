export interface SendEmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  messageId: string;
}

export interface IMailDriver {
  send(payload: SendEmailPayload): Promise<SendEmailResult>;
}

export const MAIL_DRIVER_TOKEN = Symbol("MAIL_DRIVER_TOKEN");
export const MAIL_QUEUE_NAME = "mail";
export const SEND_MAIL_JOB = "send-mail";

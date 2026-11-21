/**
 * NestJS DI token and BullMQ queue identifiers for the Mail Module (`ADR-0035`).
 */
export const MAIL_DRIVER_TOKEN = Symbol("MAIL_DRIVER_TOKEN");
export const MAIL_QUEUE_NAME = "mail";
export const SEND_MAIL_JOB = "send-mail";

import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import {
  MAIL_DRIVER_TOKEN,
  MAIL_QUEUE_NAME,
  SEND_MAIL_JOB,
  type IMailDriver,
  type SendEmailPayload,
  type SendEmailResult,
} from "./mail.interface";

@Processor(MAIL_QUEUE_NAME)
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(
    @Inject(MAIL_DRIVER_TOKEN)
    private readonly mailDriver: IMailDriver,
  ) {
    super();
  }

  async process(job: Job<SendEmailPayload>): Promise<SendEmailResult | void> {
    if (job.name !== SEND_MAIL_JOB) {
      this.logger.warn(
        `Unknown job name "${job.name}" in ${MAIL_QUEUE_NAME} queue`,
      );
      return;
    }

    this.logger.log(
      `Processing email job [${job.id}] to "${String(job.data.to)}" (Subject: "${job.data.subject}")`,
    );

    const result = await this.mailDriver.send(job.data);
    this.logger.log(
      `Completed email job [${job.id}] with message ID: ${result.messageId}`,
    );
    return result;
  }
}

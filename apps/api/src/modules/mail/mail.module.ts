import { Global, Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { env } from "@/common/config/env.config";
import { MAIL_DRIVER_TOKEN, MAIL_QUEUE_NAME } from "./mail.interface";
import { MailService } from "./mail.service";
import { MailProcessor } from "./mail.processor";
import { MockMailDriver } from "./drivers/mock-mail.driver";
import { ResendMailDriver } from "./drivers/resend-mail.driver";

@Global()
@Module({
  imports: [
    BullModule.registerQueue({
      name: MAIL_QUEUE_NAME,
    }),
  ],
  providers: [
    MockMailDriver,
    ResendMailDriver,
    {
      provide: MAIL_DRIVER_TOKEN,
      useFactory: (mock: MockMailDriver, resend: ResendMailDriver) => {
        // Use Resend in production or whenever an API key is explicitly supplied;
        // fallback to MockMailDriver for local offline development and tests.
        if (env.RESEND_API_KEY && env.NODE_ENV === "production") {
          return resend;
        }
        return mock;
      },
      inject: [MockMailDriver, ResendMailDriver],
    },
    MailService,
    MailProcessor,
  ],
  exports: [MailService, MAIL_DRIVER_TOKEN, MockMailDriver],
})
export class MailModule {}

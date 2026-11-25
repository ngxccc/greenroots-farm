import { Global, Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { env, type ApiEnvironment } from "@/common/config/env.config";
import { MAIL_DRIVER_TOKEN, MAIL_QUEUE_NAME } from "./mail.constant";
import type { IMailDriver } from "./mail.interface";
import { MailService } from "./mail.service";
import { MailProcessor } from "./mail.processor";
import { MockMailDriver } from "./drivers/mock-mail.driver";
import { ResendMailDriver } from "./drivers/resend-mail.driver";

type MailDriverEnv = Pick<
  ApiEnvironment,
  "NODE_ENV" | "MAIL_DRIVER" | "RESEND_API_KEY"
>;

/**
 * Selects the active `IMailDriver`, failing closed when `MAIL_DRIVER=resend`
 * is configured outside `test` without `RESEND_API_KEY`.
 *
 * @param activeEnv Active API environment configuration.
 * @param mock In-memory mock mail driver.
 * @param resend Resend API mail driver.
 * @returns Resolved `IMailDriver` implementation.
 */
export function resolveMailDriver(
  activeEnv: MailDriverEnv,
  mock: MockMailDriver,
  resend: ResendMailDriver,
): IMailDriver {
  if (activeEnv.NODE_ENV === "test" || activeEnv.MAIL_DRIVER === "mock") {
    return mock;
  }

  if (!activeEnv.RESEND_API_KEY?.trim()) {
    throw new Error("RESEND_API_KEY is required when MAIL_DRIVER is 'resend'");
  }

  return resend;
}

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
      useFactory: (mock: MockMailDriver, resend: ResendMailDriver) =>
        resolveMailDriver(env, mock, resend),
      inject: [MockMailDriver, ResendMailDriver],
    },
    MailService,
    MailProcessor,
  ],
  exports: [MailService, MAIL_DRIVER_TOKEN, MockMailDriver],
})
export class MailModule {}

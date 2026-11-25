import { Module } from "@nestjs/common";
import { SubscriptionPlansController } from "./subscription-plans.controller";
import { SubscriptionPlansService } from "./subscription-plans.service";

/**
 * Subscription plans and prepaid recurring produce box module.
 */
@Module({
  controllers: [SubscriptionPlansController],
  providers: [SubscriptionPlansService],
  exports: [SubscriptionPlansService],
})
export class SubscriptionsModule {}

import { Module } from "@nestjs/common";
import { FarmsModule } from "@/modules/farms/farms.module";
import { ShippingModule } from "@/modules/orders/shipping/shipping.module";
import { PaymentsModule } from "@/modules/payments/payments.module";
import { UsersModule } from "@/modules/users/users.module";
import { SubscriptionPlansController } from "./subscription-plans.controller";
import { SubscriptionPlansService } from "./subscription-plans.service";
import { SubscriptionsController } from "./subscriptions.controller";
import { SubscriptionsService } from "./subscriptions.service";

/**
 * Subscription plans and prepaid recurring produce box module.
 */
@Module({
  imports: [UsersModule, FarmsModule, ShippingModule, PaymentsModule],
  controllers: [SubscriptionPlansController, SubscriptionsController],
  providers: [SubscriptionPlansService, SubscriptionsService],
  exports: [SubscriptionPlansService, SubscriptionsService],
})
export class SubscriptionsModule {}

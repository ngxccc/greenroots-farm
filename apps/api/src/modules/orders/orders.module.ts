import { Module } from "@nestjs/common";
import { FarmsModule } from "@/modules/farms/farms.module";
import { UsersModule } from "@/modules/users/users.module";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { ShippingModule } from "./shipping/shipping.module";

/**
 * Customer orders domain module hosting cart validation and COD checkout.
 */
@Module({
  imports: [UsersModule, FarmsModule, ShippingModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}

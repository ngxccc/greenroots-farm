import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { env } from "@/common/config/env.config";
import { SubscriptionsService } from "@/modules/subscriptions/subscriptions.service";
import { EXPIRY_SWEEP_INTERVAL_MS } from "./orders.constant";
import { OrdersService } from "./orders.service";

/**
 * Periodically sweeps expired order and subscription reservations (`INV-ORD-22`, `INV-EXP-4`).
 */
@Injectable()
export class OrdersExpiryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrdersExpiryService.name);
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    private readonly ordersService: OrdersService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  onModuleInit(): void {
    if (env.NODE_ENV === "test") {
      return;
    }

    this.timer = setInterval(() => {
      void this.runSweep();
    }, EXPIRY_SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Executes one expiry sweep pass for orders and subscriptions unless another pass is already in flight.
   */
  async runSweep(now: Date = new Date()): Promise<number> {
    if (this.isRunning) {
      return 0;
    }

    this.isRunning = true;
    try {
      let expiredOrders = 0;
      let expiredSubscriptions = 0;

      // Isolate order and subscription sweeps so an error in one domain never starves the other.
      try {
        expiredOrders = await this.ordersService.expireStaleReservations(now);
        if (expiredOrders > 0) {
          this.logger.log(
            `Expired ${expiredOrders} stale order reservation(s).`,
          );
        }
      } catch (error) {
        this.logger.error(
          "Error occurred during order reservation expiry sweep",
          error instanceof Error ? error.stack : String(error),
        );
      }

      try {
        expiredSubscriptions =
          await this.subscriptionsService.expireStaleReservations(now);
        if (expiredSubscriptions > 0) {
          this.logger.log(
            `Expired ${expiredSubscriptions} stale subscription reservation(s).`,
          );
        }
      } catch (error) {
        this.logger.error(
          "Error occurred during subscription reservation expiry sweep",
          error instanceof Error ? error.stack : String(error),
        );
      }

      return expiredOrders + expiredSubscriptions;
    } finally {
      this.isRunning = false;
    }
  }
}

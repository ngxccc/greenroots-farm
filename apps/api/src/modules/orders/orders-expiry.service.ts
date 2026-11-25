import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { env } from "@/common/config/env.config";
import { EXPIRY_SWEEP_INTERVAL_MS } from "./orders.constant";
import { OrdersService } from "./orders.service";

/**
 * Periodically sweeps expired order stock reservations (`INV-ORD-22`).
 */
@Injectable()
export class OrdersExpiryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrdersExpiryService.name);
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(private readonly ordersService: OrdersService) {}

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
   * Executes one expiry sweep pass unless another pass is already in flight.
   */
  async runSweep(now: Date = new Date()): Promise<number> {
    if (this.isRunning) {
      return 0;
    }

    this.isRunning = true;
    try {
      const expiredCount =
        await this.ordersService.expireStaleReservations(now);
      if (expiredCount > 0) {
        this.logger.log(`Expired ${expiredCount} stale order reservation(s).`);
      }
      return expiredCount;
    } catch (error) {
      this.logger.error(
        "Error occurred during order reservation expiry sweep",
        error instanceof Error ? error.stack : String(error),
      );
      return 0;
    } finally {
      this.isRunning = false;
    }
  }
}

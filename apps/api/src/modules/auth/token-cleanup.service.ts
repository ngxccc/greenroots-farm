import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { lt } from "drizzle-orm";
import { TOKEN_CLEANUP_INTERVAL_MS } from "@/common/constants/auth.constant";
import {
  DATABASE_CONNECTION,
  type DrizzleDB,
} from "@/database/database.module";
import { refreshTokens } from "@/database/schemas";

@Injectable()
export class TokenCleanupService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(TokenCleanupService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DrizzleDB,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      void this.cleanupTokens();
    }, TOKEN_CLEANUP_INTERVAL_MS);

    this.timer.unref();

    this.logger.log("Token Cleanup Service started.");
    void this.cleanupTokens();
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.logger.log("Token Cleanup Service stopped.");
  }

  async cleanupTokens(): Promise<void> {
    try {
      this.logger.debug("Starting cleanup of expired refresh tokens...");

      await this.db
        .delete(refreshTokens)
        .where(lt(refreshTokens.expiresAt, new Date()));

      this.logger.debug("Successfully cleaned up expired refresh tokens.");
    } catch (error) {
      this.logger.error("Error occurred during expired token cleanup", error);
    }
  }
}

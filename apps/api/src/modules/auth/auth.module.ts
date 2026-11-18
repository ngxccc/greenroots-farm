import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { TokenCleanupService } from "./token-cleanup.service";

/**
 * Core Authentication and Session Lifecycle Module.
 * Conforms to ADR-0014 through ADR-0017, Issue #17, and RFC 9457 error contracts.
 */
@Module({
  controllers: [AuthController],
  providers: [AuthService, TokenCleanupService],
  exports: [AuthService],
})
export class AuthModule {}

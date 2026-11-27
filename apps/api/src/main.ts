import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { resolveAllowedOrigins } from "./common/config/cors.config";
import { env } from "./common/config/env.config";
import { setupGlobalPrefix } from "./common/config/api-prefix.config";
import { setupOpenApiAndScalar } from "./common/config/openapi.config";
import { resolveLogLevels } from "./common/constants/environment.constant";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: resolveLogLevels(env.LOG_LEVEL),
  });

  // Respect reverse-proxy headers so client IPs are correct behind Nginx/Cloudflare.
  app.set("trust proxy", 1);
  app.enableShutdownHooks();
  app.use(cookieParser());
  const allowedOrigins = resolveAllowedOrigins(env.CORS_ORIGINS);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // Enforces /api prefix and native URI versioning (v1) across all controllers
  setupGlobalPrefix(app);

  setupOpenApiAndScalar(app);

  await app.listen(env.PORT);

  const logger = new Logger("Bootstrap");
  logger.log(
    `GreenRoots Farm API is running on port ${env.PORT} (http://localhost:${env.PORT}/api/v1)`,
  );
  logger.log(
    `Scalar API docs available at http://localhost:${env.PORT}/api/docs`,
  );
}

void bootstrap();

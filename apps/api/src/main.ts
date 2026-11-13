import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { env } from "./common/config/env.config";
import { setupOpenApiAndScalar } from "./common/config/openapi.config";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Respect reverse-proxy headers so client IPs are correct behind Nginx/Cloudflare.
  app.set("trust proxy", 1);
  app.enableShutdownHooks();
  app.enableCors({
    origin: [
      "http://localhost:3001",
      "http://127.0.0.1:3001",
      "http://localhost:3002",
      "http://127.0.0.1:3002",
    ],
    credentials: true,
  });

  // All controllers live under /api/v1; docs are mounted outside the prefix.
  app.setGlobalPrefix("api/v1");

  setupOpenApiAndScalar(app);

  await app.listen(env.PORT);
}

void bootstrap();

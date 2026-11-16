import { Test, type TestingModule } from "@nestjs/testing";
import { type INestApplication } from "@nestjs/common";
import Redis from "ioredis";
import { AppModule } from "@/app.module";
import {
  DATABASE_CONNECTION,
  type DrizzleDB,
} from "@/database/database.module";
import {
  createWorkerTestDatabase,
  teardownWorkerTestDatabase,
  type TestDatabaseContext,
} from "./database.helper";
import { parseRedisOptions } from "@/common/config/redis.config";
import { env } from "@/common/config/env.config";
import { setupGlobalPrefix } from "@/common/config/api-prefix.config";
import { ZodValidationPipe } from "@/common/pipes/zod-validation.pipe";
import { GlobalExceptionFilter } from "@/common/filters/global-exception.filter";
import { probeInfrastructure } from "./infra-probe.helper";

export interface TestAppSetup {
  app: INestApplication;
  db: DrizzleDB;
  dbContext: TestDatabaseContext;
  redisClient: Redis;
  workerSchema: string;
}

export interface CreateTestAppOptions {
  schemaName?: string;
  dbContext?: TestDatabaseContext;
  configureApp?: (app: INestApplication) => void;
  controllers?: unknown[];
}

export async function cleanScopedRedisKeys(redis: Redis): Promise<void> {
  const prefix = redis.options.keyPrefix ?? "";
  let cursor = "0";

  try {
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        "*",
        "COUNT",
        500,
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        const strippedKeys = prefix
          ? keys.map((k) => (k.startsWith(prefix) ? k.slice(prefix.length) : k))
          : keys;
        await redis.unlink(...strippedKeys).catch(() => undefined);
      }
    } while (cursor !== "0");
  } catch {
    // Fail-open
  }
}

export async function createTestApp(
  options?: CreateTestAppOptions,
): Promise<TestAppSetup> {
  // Layer 2 Guard: Probe infrastructure before touching AppModule or spawning BullMQ/DB pools
  const infra = await probeInfrastructure(500);
  if (!infra.isReady) {
    const pgMsg = infra.postgres ? "ONLINE" : "OFFLINE";
    const redisMsg = infra.redis ? "ONLINE" : "OFFLINE";
    throw new Error(
      `[Infrastructure Offline] Cannot initialize TestApp: PostgreSQL is ${pgMsg}, Redis is ${redisMsg}. Run 'bun run docker:up' or run only unit tests via 'bun test src/'.`,
    );
  }

  const dbContext =
    options?.dbContext ??
    (await createWorkerTestDatabase(undefined, options?.schemaName));
  const workerSchema = dbContext.schemaName;

  const redisOptions = parseRedisOptions(env.REDIS_URL);
  const redisClient = new Redis({
    ...redisOptions,
    keyPrefix: `test:${workerSchema}:`,
    lazyConnect: true,
    connectTimeout: 500,
    commandTimeout: 500,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });

  redisClient.on("error", () => undefined);

  try {
    await redisClient.connect().catch(() => undefined);
  } catch {
    // Fail-open
  }

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
    controllers: (options?.controllers ?? []) as (new (
      ...args: unknown[]
    ) => unknown)[],
  })
    .overrideProvider(DATABASE_CONNECTION)
    .useValue(dbContext.db)
    .compile();

  const app = moduleFixture.createNestApplication();
  setupGlobalPrefix(app);
  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalFilters(new GlobalExceptionFilter());

  if (options?.configureApp) {
    options.configureApp(app);
  }

  await app.init();

  return {
    app,
    db: dbContext.db,
    dbContext,
    redisClient,
    workerSchema,
  };
}

export async function teardownTestApp(setup?: TestAppSetup): Promise<void> {
  if (!setup) return;
  try {
    await cleanScopedRedisKeys(setup.redisClient);
  } catch {
    // Fail-open
  }
  try {
    await setup.redisClient.quit().catch(() => {
      setup.redisClient.disconnect();
    });
  } catch {
    // Fail-open
  }
  try {
    await setup.app.close();
  } catch {
    // Fail-open
  }
  try {
    await teardownWorkerTestDatabase(setup.dbContext);
  } catch {
    // Fail-open
  }
}

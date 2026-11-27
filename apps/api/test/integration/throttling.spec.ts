import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import request from "supertest";
import { JwtService } from "@nestjs/jwt";
import { API_ERROR_CODES, UserRole } from "@greenroots/shared";
import { env } from "@/common/config/env.config";
import type { components } from "../generated/api-schema.d";
import {
  createAuthenticatedAdmin,
  type AuthenticatedSession,
} from "../helpers/auth.helper";
import {
  createTestApp,
  teardownTestApp,
  type TestAppSetup,
} from "../helpers/app.helper";

type Rfc9457ErrorResponse = components["schemas"]["Rfc9457ErrorResponseDto"];

const TEST_PROXY_SECRET = "test-throttling-proxy-secret-32chars";
const SAMPLE_UUID_V7 = "019fa8bc-8f4d-7000-b366-e691f45cfb91";

describe("Throttling Integration", () => {
  let setup: TestAppSetup;
  let staffSession: AuthenticatedSession;
  let ipCounter = 1;

  function nextClientHeaders(): Record<string, string> {
    const octet = ipCounter++;
    return {
      "x-internal-proxy-secret": TEST_PROXY_SECRET,
      "x-bff-client-ip": `203.0.113.${octet}`,
    };
  }

  function expectTooManyRequests(res: request.Response): void {
    expect(res.status).toBe(429);
    const body = res.body as Rfc9457ErrorResponse;
    expect(body.type).toBe("/errors/too-many-requests");
    expect(body.code).toBe(API_ERROR_CODES.TOO_MANY_REQUESTS);
  }

  async function assertBurstThrottled(options: {
    path: string;
    allowedCount: number;
    expectedPreThrottleStatus: number;
    payload?: Record<string, unknown>;
    headers?: Record<string, string>;
  }): Promise<void> {
    const requestHeaders = {
      ...options.headers,
      ...nextClientHeaders(),
    };

    await withProductionThrottling(async () => {
      for (let i = 0; i < options.allowedCount; i++) {
        const res = await request(setup.app.getHttpServer())
          .post(options.path)
          .set(requestHeaders)
          .send(options.payload ?? {});

        expect(res.status).toBe(options.expectedPreThrottleStatus);
      }

      const throttledRes = await request(setup.app.getHttpServer())
        .post(options.path)
        .set(requestHeaders)
        .send(options.payload ?? {});

      expectTooManyRequests(throttledRes);
    });
  }

  async function withProductionThrottling<T>(fn: () => Promise<T>): Promise<T> {
    const originalEnv = env.NODE_ENV;
    const originalSecret = env.INTERNAL_PROXY_SECRET;
    (env as { NODE_ENV: string }).NODE_ENV = "production";
    (env as { INTERNAL_PROXY_SECRET?: string }).INTERNAL_PROXY_SECRET =
      TEST_PROXY_SECRET;

    try {
      return await fn();
    } finally {
      (env as { NODE_ENV: string }).NODE_ENV = originalEnv;
      (env as { INTERNAL_PROXY_SECRET?: string }).INTERNAL_PROXY_SECRET =
        originalSecret;
    }
  }

  beforeAll(async () => {
    setup = await createTestApp();
    const jwtService = setup.app.get(JwtService);
    staffSession = await createAuthenticatedAdmin(
      setup.db,
      jwtService,
      UserRole.ADMIN,
    );
  });

  afterAll(async () => {
    await teardownTestApp(setup);
  });

  beforeEach(() => {
    ipCounter += 1;
  });

  describe("GET /api/v1/payments", () => {
    it("allows more than five staff ledger requests within a minute", async () => {
      const headers = {
        ...staffSession.authHeader,
        ...nextClientHeaders(),
      };

      await withProductionThrottling(async () => {
        for (let i = 0; i < 8; i++) {
          const res = await request(setup.app.getHttpServer())
            .get("/api/v1/payments")
            .set(headers);

          expect(res.status).toBe(200);
        }
      });
    });
  });

  describe("POST /api/v1/payments/:id/confirm-cod", () => {
    it("rejects confirm-cod requests exceeding thirty attempts per minute", async () => {
      await assertBurstThrottled({
        path: `/api/v1/payments/${SAMPLE_UUID_V7}/confirm-cod`,
        allowedCount: 30,
        expectedPreThrottleStatus: 404,
        headers: staffSession.authHeader,
      });
    });
  });

  describe("POST /api/v1/payments/payos/webhook", () => {
    it("skips throttling on PayOS webhook bursts", async () => {
      const headers = nextClientHeaders();

      await withProductionThrottling(async () => {
        for (let i = 0; i < 10; i++) {
          const res = await request(setup.app.getHttpServer())
            .post("/api/v1/payments/payos/webhook")
            .set(headers)
            .send({});

          expect(res.status).not.toBe(429);
        }
      });
    });
  });

  describe("POST /api/v1/auth/register", () => {
    it("rejects registration requests exceeding five attempts per minute", async () => {
      await assertBurstThrottled({
        path: "/api/v1/auth/register",
        allowedCount: 5,
        expectedPreThrottleStatus: 400,
      });
    });
  });

  describe("POST /api/v1/auth/verify-email", () => {
    it("rejects verify-email requests exceeding ten attempts per minute", async () => {
      await assertBurstThrottled({
        path: "/api/v1/auth/verify-email",
        allowedCount: 10,
        expectedPreThrottleStatus: 400,
      });
    });
  });

  describe("POST /api/v1/auth/resend-verification", () => {
    it("rejects resend-verification requests exceeding three attempts per minute", async () => {
      await assertBurstThrottled({
        path: "/api/v1/auth/resend-verification",
        allowedCount: 3,
        expectedPreThrottleStatus: 400,
      });
    });
  });

  describe("POST /api/v1/auth/customer/login", () => {
    it("rejects customer login requests exceeding five attempts per minute", async () => {
      await assertBurstThrottled({
        path: "/api/v1/auth/customer/login",
        allowedCount: 5,
        expectedPreThrottleStatus: 401,
        payload: {
          email: "nobody@greenroots.farm",
          password: "WrongPassword1!",
        },
      });
    });
  });

  describe("POST /api/v1/auth/staff/login", () => {
    it("rejects staff login requests exceeding five attempts per minute", async () => {
      await assertBurstThrottled({
        path: "/api/v1/auth/staff/login",
        allowedCount: 5,
        expectedPreThrottleStatus: 401,
        payload: {
          email: "nobody@greenroots.farm",
          password: "WrongPassword1!",
        },
      });
    });
  });

  describe("POST /api/v1/auth/customer/refresh", () => {
    it("rejects customer refresh requests exceeding ten attempts per minute", async () => {
      await assertBurstThrottled({
        path: "/api/v1/auth/customer/refresh",
        allowedCount: 10,
        expectedPreThrottleStatus: 400,
      });
    });
  });

  describe("POST /api/v1/auth/staff/refresh", () => {
    it("rejects staff refresh requests exceeding ten attempts per minute", async () => {
      await assertBurstThrottled({
        path: "/api/v1/auth/staff/refresh",
        allowedCount: 10,
        expectedPreThrottleStatus: 401,
      });
    });
  });

  describe("POST /api/v1/auth/logout", () => {
    it("rejects logout requests exceeding ten attempts per minute", async () => {
      await assertBurstThrottled({
        path: "/api/v1/auth/logout",
        allowedCount: 10,
        expectedPreThrottleStatus: 200,
      });
    });
  });

  describe("POST /api/v1/auth/logout-all", () => {
    it("rejects logout-all requests exceeding two attempts per minute", async () => {
      await assertBurstThrottled({
        path: "/api/v1/auth/logout-all",
        allowedCount: 2,
        expectedPreThrottleStatus: 401,
      });
    });
  });

  describe("POST /api/v1/auth/forgot-password", () => {
    it("rejects forgot-password requests exceeding three attempts per minute", async () => {
      await assertBurstThrottled({
        path: "/api/v1/auth/forgot-password",
        allowedCount: 3,
        expectedPreThrottleStatus: 400,
      });
    });
  });

  describe("POST /api/v1/auth/reset-password", () => {
    it("rejects reset-password requests exceeding five attempts per minute", async () => {
      await assertBurstThrottled({
        path: "/api/v1/auth/reset-password",
        allowedCount: 5,
        expectedPreThrottleStatus: 400,
      });
    });
  });
});

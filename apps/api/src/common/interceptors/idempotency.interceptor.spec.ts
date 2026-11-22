import { describe, expect, it, beforeEach } from "bun:test";
import { firstValueFrom, of, throwError } from "rxjs";
import {
  BadRequestException,
  type CallHandler,
  type ExecutionContext,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { Reflector } from "@nestjs/core";
import { IdempotencyInterceptor } from "./idempotency.interceptor";
import type { IdempotencyService } from "@/common/services/idempotency.service";

interface MockResponse extends Response {
  statusCode: number;
}

class TestContextController {
  checkout() {
    return "ok";
  }
}

function createMockContext(
  headers: Record<string, string>,
  body: unknown = {},
  userSub?: string,
  path = "/api/v1/orders/checkout",
) {
  const request = {
    headers,
    body,
    method: "POST",
    baseUrl: "",
    path,
    url: path,
    route: { path: "/api/v1/orders/:id/cancel" },
    user: userSub ? { sub: userSub } : undefined,
  } as unknown as Request;

  const response: MockResponse = {
    statusCode: 200,
    status(code: number) {
      response.statusCode = code;
      return response;
    },
  } as MockResponse;

  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
    getHandler: () => () => "handler",
    getClass: () => TestContextController,
  } as unknown as ExecutionContext;

  return { context, request, response };
}

describe("IdempotencyInterceptor", () => {
  let completedKeys: string[];
  let releasedKeys: string[];
  let acquiredScopes: (string | undefined)[];
  let completedScopes: (string | undefined)[];
  let releasedScopes: (string | undefined)[];
  let mockService: IdempotencyService;

  beforeEach(() => {
    completedKeys = [];
    releasedKeys = [];
    acquiredScopes = [];
    completedScopes = [];
    releasedScopes = [];
    mockService = {
      acquire: (_key: string, _body: unknown, scope?: string) => {
        acquiredScopes.push(scope);
        return Promise.resolve({ isNew: true, cached: null });
      },
      complete: (
        key: string,
        _status: number,
        _body: unknown,
        _ttl?: number,
        _payload?: unknown,
        scope?: string,
      ) => {
        completedKeys.push(key);
        completedScopes.push(scope);
        return Promise.resolve();
      },
      release: (key: string, scope?: string) => {
        releasedKeys.push(key);
        releasedScopes.push(scope);
        return Promise.resolve();
      },
    } as unknown as IdempotencyService;
  });

  describe("intercept", () => {
    const validKey = "019318b7-657d-7848-8df0-e374528148b1";

    it("executes handler and records completion when request is new and Idempotency-Key header is present", async () => {
      const interceptor = new IdempotencyInterceptor(mockService);
      const { context } = createMockContext({
        "idempotency-key": validKey,
      });

      let handlerCalls = 0;
      const callHandler: CallHandler = {
        handle: () => {
          handlerCalls++;
          return of({ success: true, data: { orderId: "order-123" } });
        },
      };

      const result = await firstValueFrom(
        interceptor.intercept(context, callHandler),
      );

      expect(handlerCalls).toBe(1);
      expect(completedKeys).toContain(validKey);
      expect(acquiredScopes).toEqual([
        "anonymous:POST:/api/v1/orders/checkout",
      ]);
      expect(completedScopes).toEqual([
        "anonymous:POST:/api/v1/orders/checkout",
      ]);
      expect(result).toEqual({
        success: true,
        data: { orderId: "order-123" },
      });
    });

    it("scopes idempotency keys by authenticated userId and concrete request path when Idempotency-Key header is present", async () => {
      const interceptor = new IdempotencyInterceptor(mockService);
      const { context: ctx1 } = createMockContext(
        { "idempotency-key": validKey },
        {},
        "user-uuid-123",
        "/api/v1/orders/ord-1/cancel",
      );
      const { context: ctx2 } = createMockContext(
        { "idempotency-key": validKey },
        {},
        "user-uuid-123",
        "/api/v1/orders/ord-2/cancel",
      );

      await firstValueFrom(
        interceptor.intercept(ctx1, {
          handle: () => of({ success: true }),
        }),
      );
      await firstValueFrom(
        interceptor.intercept(ctx2, {
          handle: () => of({ success: true }),
        }),
      );

      expect(acquiredScopes).toEqual([
        "user-uuid-123:POST:/api/v1/orders/ord-1/cancel",
        "user-uuid-123:POST:/api/v1/orders/ord-2/cancel",
      ]);
      expect(completedScopes).toEqual([
        "user-uuid-123:POST:/api/v1/orders/ord-1/cancel",
        "user-uuid-123:POST:/api/v1/orders/ord-2/cancel",
      ]);
    });

    // Invariant: INV-IDEMP-1
    it("returns cached response and skips handler execution when request is replayed with Idempotency-Key header", async () => {
      const cachedService = {
        acquire: () =>
          Promise.resolve({
            isNew: false,
            cached: { statusCode: 201, body: { orderId: "cached-123" } },
          }),
        complete: () => Promise.resolve(),
        release: () => Promise.resolve(),
      } as unknown as IdempotencyService;

      const interceptor = new IdempotencyInterceptor(cachedService);
      const { context, response } = createMockContext({
        "idempotency-key": validKey,
      });

      let handlerCalls = 0;
      const callHandler: CallHandler = {
        handle: () => {
          handlerCalls++;
          return of({ success: true });
        },
      };

      const result = await firstValueFrom(
        interceptor.intercept(context, callHandler),
      );

      expect(handlerCalls).toBe(0);
      expect(response.statusCode).toBe(201);
      expect(result).toEqual({ orderId: "cached-123" });
    });

    // Invariant: INV-IDEMP-5
    it("releases key when downstream handler throws an error and Idempotency-Key header is present", () => {
      const interceptor = new IdempotencyInterceptor(mockService);
      const { context } = createMockContext({ "idempotency-key": validKey });

      const callHandler: CallHandler = {
        handle: () =>
          throwError(() => new Error("Database transaction rolled back")),
      };

      expect(
        firstValueFrom(interceptor.intercept(context, callHandler)),
      ).rejects.toThrow("Database transaction rolled back");

      expect(releasedKeys).toContain(validKey);
    });

    it("rejects request when Idempotency-Key header is missing on a required idempotent route", () => {
      const mockReflector = {
        getAllAndOverride: () => ({ required: true }),
      } as unknown as Reflector;

      const interceptor = new IdempotencyInterceptor(
        mockService,
        mockReflector,
      );
      const { context } = createMockContext({});

      const callHandler: CallHandler = {
        handle: () => of({ success: true }),
      };

      expect(() => interceptor.intercept(context, callHandler)).toThrow(
        BadRequestException,
      );
    });

    it("passes through to next handler when Idempotency-Key header is missing and route does not require idempotency", async () => {
      const interceptor = new IdempotencyInterceptor(mockService);
      const { context } = createMockContext({});

      let handlerCalled = false;
      const callHandler: CallHandler = {
        handle: () => {
          handlerCalled = true;
          return of({ success: true, passthrough: true });
        },
      };

      const result = await firstValueFrom(
        interceptor.intercept(context, callHandler),
      );

      expect(handlerCalled).toBe(true);
      expect(result).toEqual({ success: true, passthrough: true });
    });
  });
});

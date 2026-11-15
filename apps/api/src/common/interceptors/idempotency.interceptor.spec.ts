import { describe, expect, it } from "bun:test";
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
) {
  const request = {
    headers,
    body,
    method: "POST",
    url: "/api/v1/orders/checkout",
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

describe("IdempotencyInterceptor Integration", () => {
  describe("POST with Idempotency-Key", () => {
    it("should execute handler and return response on first request (INV-IDEMP-1)", async () => {
      let completed = false;
      const mockService = {
        acquire: () => Promise.resolve({ isNew: true, cached: null }),
        complete: () => {
          completed = true;
          return Promise.resolve();
        },
        release: () => Promise.resolve(),
      } as unknown as IdempotencyService;

      const interceptor = new IdempotencyInterceptor(mockService);
      const { context } = createMockContext({
        "idempotency-key": "019318b7-657d-7848-8df0-e374528148b1",
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
      expect(completed).toBe(true);
      expect(result).toEqual({ success: true, data: { orderId: "order-123" } });
    });

    it("should return cached response and skip handler execution on replay (INV-IDEMP-1)", async () => {
      const mockService = {
        acquire: () =>
          Promise.resolve({
            isNew: false,
            cached: { statusCode: 201, body: { orderId: "cached-123" } },
          }),
        complete: () => Promise.resolve(),
        release: () => Promise.resolve(),
      } as unknown as IdempotencyService;

      const interceptor = new IdempotencyInterceptor(mockService);
      const { context, response } = createMockContext({
        "idempotency-key": "019318b7-657d-7848-8df0-e374528148b1",
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

    it("should release key if handler throws an error (INV-IDEMP-5)", async () => {
      let releasedKey: string | undefined;
      const mockService = {
        acquire: () => Promise.resolve({ isNew: true, cached: null }),
        complete: () => Promise.resolve(),
        release: (k: string) => {
          releasedKey = k;
          return Promise.resolve();
        },
      } as unknown as IdempotencyService;

      const interceptor = new IdempotencyInterceptor(mockService);
      const testKey = "019318b7-657d-7848-8df0-e374528148b1";
      const { context } = createMockContext({ "idempotency-key": testKey });

      const callHandler: CallHandler = {
        handle: () =>
          throwError(() => new Error("Database transaction rolled back")),
      };

      let caughtError: Error | undefined;
      try {
        await firstValueFrom(interceptor.intercept(context, callHandler));
      } catch (err) {
        caughtError = err as Error;
      }

      expect(caughtError).toBeDefined();
      expect(caughtError?.message).toBe("Database transaction rolled back");
      expect(releasedKey).toBe(testKey);
    });

    it("should reject with 400 Bad Request when header is required but missing", () => {
      const mockService = {} as unknown as IdempotencyService;
      const mockReflector = {
        getAllAndOverride: () => ({ required: true }),
      } as unknown as Reflector;

      const interceptor = new IdempotencyInterceptor(
        mockService,
        mockReflector,
      );
      const { context } = createMockContext({}); // No Idempotency-Key header

      const callHandler: CallHandler = {
        handle: () => of({ success: true }),
      };

      expect(() => interceptor.intercept(context, callHandler)).toThrow(
        BadRequestException,
      );
    });
  });
});

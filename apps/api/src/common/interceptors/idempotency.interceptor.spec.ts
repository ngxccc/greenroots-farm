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

describe("IdempotencyInterceptor", () => {
  let completedKeys: string[];
  let releasedKeys: string[];
  let mockService: IdempotencyService;

  beforeEach(() => {
    completedKeys = [];
    releasedKeys = [];
    mockService = {
      acquire: (_key: string) => Promise.resolve({ isNew: true, cached: null }),
      complete: (key: string) => {
        completedKeys.push(key);
        return Promise.resolve();
      },
      release: (key: string) => {
        releasedKeys.push(key);
        return Promise.resolve();
      },
    } as unknown as IdempotencyService;
  });

  describe("intercept", () => {
    const validKey = "019318b7-657d-7848-8df0-e374528148b1";

    describe("when Idempotency-Key header is present", () => {
      it("should execute handler and record completion when request is new", async () => {
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
        expect(result).toEqual({
          success: true,
          data: { orderId: "order-123" },
        });
      });

      it("should return cached response and skip handler execution when request is replayed", async () => {
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

      it("should release key when downstream handler throws an error", () => {
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
    });

    describe("when Idempotency-Key header is missing", () => {
      it("should reject with 400 Bad Request when route requires idempotency", () => {
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

      it("should pass through to next handler when route does not require idempotency", async () => {
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
});

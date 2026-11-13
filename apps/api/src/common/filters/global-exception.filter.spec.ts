import { describe, expect, test } from "bun:test";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { ArgumentsHost } from "@nestjs/common";
import type { Request, Response } from "express";
import { GlobalExceptionFilter } from "./global-exception.filter";
import { MESSAGES } from "@/common/constants/messages.constant";

interface MockResponse extends Response {
  statusCode: number;
  headers: Record<string, string>;
  body: Record<string, unknown> | undefined;
}

function createMockHost(url = "/api/v1/test") {
  const response = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: undefined as Record<string, unknown> | undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(key: string, value: string) {
      this.headers[key] = value;
      return this;
    },
    json(payload: Record<string, unknown>) {
      this.body = payload;
      return this;
    },
  } as MockResponse;

  const request = { url, originalUrl: url } as Request;

  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;

  return { response, host };
}

describe("GlobalExceptionFilter (RFC 9457)", () => {
  const filter = new GlobalExceptionFilter();

  test("maps PostgreSQL P0001 trigger rejection to HTTP 403", () => {
    const { response, host } = createMockHost();
    const dbError = Object.assign(new Error("FARMING_LOG_IMMUTABLE"), {
      code: "P0001",
      message: "FARMING_LOG_IMMUTABLE: Nghiem cam UPDATE hoac DELETE",
    });
    const wrapped = new Error("Failed query", { cause: dbError });

    filter.catch(wrapped, host);

    expect(response.statusCode).toBe(403);
    expect(response.headers["Content-Type"]).toBe("application/problem+json");
    expect(response.body?.["type"]).toBe("/errors/forbidden");
    expect(response.body?.["detail"]).toBe(MESSAGES.DATABASE.IMMUTABLE_RECORD);
  });

  test("maps PostgreSQL 23503 foreign key violation to HTTP 409", () => {
    const { response, host } = createMockHost();
    const dbError = Object.assign(new Error("foreign key"), {
      code: "23503",
      constraint: "orders_customer_id_users_id_fk",
    });

    filter.catch(new Error("Failed query", { cause: dbError }), host);

    expect(response.statusCode).toBe(409);
    expect(response.body?.["type"]).toBe("/errors/conflict");
    expect(response.body?.["detail"]).toBe(
      MESSAGES.DATABASE.FOREIGN_KEY_VIOLATION,
    );
  });

  test("maps PostgreSQL 23514 check violation to HTTP 422", () => {
    const { response, host } = createMockHost();
    const dbError = Object.assign(new Error("check constraint"), {
      code: "23514",
      constraint: "products_base_price_non_negative",
    });

    filter.catch(new Error("Failed query", { cause: dbError }), host);

    expect(response.statusCode).toBe(422);
    expect(response.body?.["type"]).toBe("/errors/unprocessable-entity");
    expect(response.body?.["detail"]).toBe(MESSAGES.DATABASE.CHECK_VIOLATION);
  });

  test("preserves invalidParams and problem shape for HTTP exceptions", () => {
    const { response, host } = createMockHost("/api/v1/auth/login");
    const exception = new BadRequestException({
      detail: MESSAGES.VALIDATION.INVALID_INPUT,
      invalidParams: [{ name: "email", reason: "Email không hợp lệ" }],
    });

    filter.catch(exception, host);

    expect(response.statusCode).toBe(400);
    expect(response.body?.["instance"]).toBe("/api/v1/auth/login");
    expect(response.body?.["invalidParams"]).toEqual([
      { name: "email", reason: "Email không hợp lệ" },
    ]);
    expect(typeof response.body?.["timestamp"]).toBe("string");
  });

  test("returns a static problem type for framework exceptions", () => {
    const { response, host } = createMockHost();

    filter.catch(new NotFoundException(), host);

    expect(response.statusCode).toBe(404);
    expect(response.body?.["type"]).toBe("/errors/not-found");
    expect(response.body?.["detail"]).toBe(MESSAGES.COMMON.NOT_FOUND);
    expect(response.body?.["invalidParams"]).toEqual([]);
  });
});

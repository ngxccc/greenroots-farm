import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { PG_ERROR_CODE } from "@/common/constants/error.constant";
import {
  ERROR_SLUGS,
  MESSAGES,
  type ErrorSlug,
} from "@/common/constants/messages.constant";
import { extractDatabaseErrorDetails } from "@/common/utils/error.util";

export interface InvalidParam {
  name: string;
  reason: string;
}

export interface Rfc9457ProblemDetails {
  type: `/errors/${ErrorSlug}`;
  title: string;
  status: number;
  detail: string;
  instance: string;
  invalidParams: InvalidParam[];
  timestamp: string;
}

const HTTP_TITLES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: "Bad Request",
  [HttpStatus.UNAUTHORIZED]: "Unauthorized",
  [HttpStatus.FORBIDDEN]: "Forbidden",
  [HttpStatus.NOT_FOUND]: "Not Found",
  [HttpStatus.METHOD_NOT_ALLOWED]: "Method Not Allowed",
  [HttpStatus.CONFLICT]: "Conflict",
  [HttpStatus.PAYLOAD_TOO_LARGE]: "Payload Too Large",
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: "Unsupported Media Type",
  [HttpStatus.UNPROCESSABLE_ENTITY]: "Unprocessable Entity",
  [HttpStatus.TOO_MANY_REQUESTS]: "Too Many Requests",
  [HttpStatus.INTERNAL_SERVER_ERROR]: "Internal Server Error",
  [HttpStatus.BAD_GATEWAY]: "Bad Gateway",
  [HttpStatus.SERVICE_UNAVAILABLE]: "Service Unavailable",
  [HttpStatus.GATEWAY_TIMEOUT]: "Gateway Timeout",
};

const STATUS_SLUGS: Record<number, ErrorSlug> = {
  [HttpStatus.BAD_REQUEST]: ERROR_SLUGS.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: ERROR_SLUGS.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ERROR_SLUGS.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ERROR_SLUGS.NOT_FOUND,
  [HttpStatus.CONFLICT]: ERROR_SLUGS.CONFLICT,
  [HttpStatus.UNPROCESSABLE_ENTITY]: ERROR_SLUGS.UNPROCESSABLE_ENTITY,
  [HttpStatus.TOO_MANY_REQUESTS]: ERROR_SLUGS.TOO_MANY_REQUESTS,
  [HttpStatus.INTERNAL_SERVER_ERROR]: ERROR_SLUGS.INTERNAL_SERVER_ERROR,
  [HttpStatus.SERVICE_UNAVAILABLE]: ERROR_SLUGS.SERVICE_UNAVAILABLE,
  [HttpStatus.GATEWAY_TIMEOUT]: ERROR_SLUGS.GATEWAY_TIMEOUT,
};

const DEFAULT_DETAILS: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: MESSAGES.COMMON.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: MESSAGES.COMMON.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: MESSAGES.COMMON.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: MESSAGES.COMMON.NOT_FOUND,
  [HttpStatus.CONFLICT]: MESSAGES.COMMON.CONFLICT,
  [HttpStatus.UNPROCESSABLE_ENTITY]: MESSAGES.COMMON.UNPROCESSABLE_ENTITY,
  [HttpStatus.TOO_MANY_REQUESTS]: MESSAGES.COMMON.TOO_MANY_REQUESTS,
  [HttpStatus.SERVICE_UNAVAILABLE]: MESSAGES.COMMON.SERVICE_UNAVAILABLE,
  [HttpStatus.GATEWAY_TIMEOUT]: MESSAGES.COMMON.GATEWAY_TIMEOUT,
};

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(
  source: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Global RFC 9457 (`application/problem+json`) exception filter.
 *
 * - Always returns a static `/errors/<slug>` problem type.
 * - Maps PostgreSQL P0001 (trigger rejection) to HTTP 403.
 * - Maps PostgreSQL 23503 (foreign key violation) to HTTP 409.
 * - Maps PostgreSQL 23514 (check violation) to HTTP 422.
 */
@Injectable()
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let detail: string = MESSAGES.COMMON.INTERNAL_SERVER_ERROR;
    let title: string | undefined;
    let invalidParams: InvalidParam[] = [];

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const parsed = this.parseHttpException(exception);
      detail = this.normalizeDetail(parsed.detail, status);
      invalidParams = parsed.invalidParams;
      title = this.readExceptionError(exception);
    } else {
      const databaseError = extractDatabaseErrorDetails(exception);

      if (databaseError.isDatabaseError) {
        this.logger.error(
          `Database Exception [${databaseError.code ?? "UNKNOWN"}] | Table: ${databaseError.table ?? "N/A"} | Constraint: ${databaseError.constraint ?? "N/A"} | ${databaseError.message ?? "Database operation failed"}`,
        );

        switch (databaseError.code) {
          case PG_ERROR_CODE.RAISE_EXCEPTION:
            status = HttpStatus.FORBIDDEN;
            detail = databaseError.message?.includes("FARMING_LOG_IMMUTABLE")
              ? MESSAGES.DATABASE.IMMUTABLE_RECORD
              : MESSAGES.COMMON.FORBIDDEN;
            break;
          case PG_ERROR_CODE.FOREIGN_KEY_VIOLATION:
            status = HttpStatus.CONFLICT;
            detail = MESSAGES.DATABASE.FOREIGN_KEY_VIOLATION;
            break;
          case PG_ERROR_CODE.UNIQUE_VIOLATION:
            status = HttpStatus.CONFLICT;
            detail = MESSAGES.DATABASE.UNIQUE_VIOLATION;
            break;
          case PG_ERROR_CODE.CHECK_VIOLATION:
            status = HttpStatus.UNPROCESSABLE_ENTITY;
            detail = MESSAGES.DATABASE.CHECK_VIOLATION;
            break;
          case PG_ERROR_CODE.SERIALIZATION_FAILURE:
          case PG_ERROR_CODE.DEADLOCK_DETECTED:
            status = HttpStatus.CONFLICT;
            detail = MESSAGES.DATABASE.CONCURRENCY_CONFLICT;
            break;
          case PG_ERROR_CODE.INVALID_TEXT_REPRESENTATION:
            status = HttpStatus.BAD_REQUEST;
            detail = MESSAGES.DATABASE.INVALID_TEXT_REPRESENTATION;
            break;
          case PG_ERROR_CODE.QUERY_CANCELED:
            status = HttpStatus.GATEWAY_TIMEOUT;
            detail = MESSAGES.COMMON.GATEWAY_TIMEOUT;
            break;
          default:
            status = HttpStatus.INTERNAL_SERVER_ERROR;
            detail = MESSAGES.COMMON.INTERNAL_SERVER_ERROR;
        }
      } else {
        this.logger.error(
          `Unhandled Exception: ${this.describeException(exception)}`,
        );
      }
    }

    const problem: Rfc9457ProblemDetails = {
      type: `/errors/${STATUS_SLUGS[status] ?? ERROR_SLUGS.INTERNAL_SERVER_ERROR}`,
      title: title ?? HTTP_TITLES[status] ?? "Error",
      status,
      detail,
      instance: request.originalUrl,
      invalidParams,
      timestamp: new Date().toISOString(),
    };

    response
      .status(status)
      .setHeader("Content-Type", "application/problem+json")
      .json(problem);
  }

  /**
   * Replaces NestJS/Express framework-default English messages with the
   * centralized Vietnamese detail for the status code.
   */
  private normalizeDetail(detail: string, status: number): string {
    const isFrameworkDefault =
      detail === HTTP_TITLES[status] ||
      /^Cannot (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) /.test(detail) ||
      detail === "Error";

    return isFrameworkDefault ? this.defaultDetail(status) : detail;
  }

  private defaultDetail(status: number): string {
    return DEFAULT_DETAILS[status] ?? MESSAGES.COMMON.INTERNAL_SERVER_ERROR;
  }

  private parseHttpException(exception: HttpException): {
    detail: string;
    invalidParams: InvalidParam[];
  } {
    const payload = exception.getResponse();

    if (typeof payload === "string") {
      return { detail: payload, invalidParams: [] };
    }

    if (!isRecordObject(payload)) {
      return {
        detail: MESSAGES.COMMON.BAD_REQUEST,
        invalidParams: [],
      };
    }

    const invalidParams = this.extractInvalidParams(payload);
    const detail =
      readString(payload, "detail") ??
      readString(payload, "message") ??
      this.extractMessageArray(payload) ??
      MESSAGES.COMMON.BAD_REQUEST;

    return { detail, invalidParams };
  }

  private readExceptionError(exception: HttpException): string | undefined {
    const payload = exception.getResponse();
    return isRecordObject(payload) ? readString(payload, "error") : undefined;
  }

  private extractMessageArray(payload: Record<string, unknown>): string | null {
    const message = payload["message"];
    if (!Array.isArray(message)) return null;

    const messages = message
      .map((item) =>
        typeof item === "string"
          ? item
          : isRecordObject(item) && typeof item["property"] === "string"
            ? item["property"]
            : null,
      )
      .filter((item): item is string => item !== null);

    return messages.length > 0 ? messages.join("; ") : null;
  }

  private extractInvalidParams(
    payload: Record<string, unknown>,
  ): InvalidParam[] {
    if (Array.isArray(payload["invalidParams"])) {
      return (payload["invalidParams"] as unknown[])
        .filter(isRecordObject)
        .map((item) => ({
          name: typeof item["name"] === "string" ? item["name"] : "payload",
          reason:
            typeof item["reason"] === "string"
              ? item["reason"]
              : MESSAGES.VALIDATION.INVALID_VALUE,
        }));
    }

    const message = payload["message"];
    if (!Array.isArray(message)) return [];

    const params: InvalidParam[] = [];

    for (const item of message) {
      if (!isRecordObject(item) || typeof item["property"] !== "string") {
        continue;
      }

      const constraints = isRecordObject(item["constraints"])
        ? item["constraints"]
        : {};
      const reason = Object.values(constraints).find(
        (value): value is string => typeof value === "string",
      );

      params.push({
        name: item["property"],
        reason: reason ?? MESSAGES.VALIDATION.INVALID_VALUE,
      });
    }

    return params;
  }

  private describeException(exception: unknown): string {
    if (exception instanceof Error) {
      return exception.stack ?? exception.message;
    }
    if (typeof exception === "object" && exception !== null) {
      return JSON.stringify(exception);
    }
    return String(exception);
  }
}

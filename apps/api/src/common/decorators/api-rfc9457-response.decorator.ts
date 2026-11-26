import { applyDecorators, HttpStatus } from "@nestjs/common";
import { ApiExtraModels, ApiResponse, getSchemaPath } from "@nestjs/swagger";
import { ERROR_SLUGS, type ErrorSlug } from "../constants/messages.constant";
import {
  InvalidParamDto,
  Rfc9457ErrorResponseDto,
} from "../dto/rfc9457-error-response.dto";

export interface ApiRfc9457ResponseOptions {
  status: number;
  description: string;
  title: string;
  detail: string;
  typeSlug?: ErrorSlug;
  code?: string;
  invalidParams?: { name: string; reason: string }[];
}

/**
 * Documents an RFC 9457 Problem Details error response in Swagger.
 */
export function ApiRfc9457Response(options: ApiRfc9457ResponseOptions) {
  const {
    status,
    description,
    title,
    detail,
    typeSlug = title.toLowerCase().replace(/\s+/g, "-") as ErrorSlug,
    code,
    invalidParams = [],
  } = options;

  return applyDecorators(
    ApiExtraModels(Rfc9457ErrorResponseDto, InvalidParamDto),
    ApiResponse({
      status,
      description,
      content: {
        "application/problem+json": {
          schema: {
            $ref: getSchemaPath(Rfc9457ErrorResponseDto),
          },
          example: {
            type: `/errors/${typeSlug}`,
            title,
            status,
            detail,
            instance: "/api/v1/resource",
            ...(code !== undefined ? { code } : {}),
            invalidParams,
            timestamp: "2026-11-16T00:00:00.000Z",
          },
        },
      },
    }),
  );
}

/**
 * Documents a 400 Bad Request RFC 9457 error response.
 */
export function ApiBadRequestResponseRfc9457(options?: {
  description?: string;
  detail?: string;
  code?: string;
  invalidParams?: { name: string; reason: string }[];
}) {
  return ApiRfc9457Response({
    status: HttpStatus.BAD_REQUEST,
    description: options?.description ?? "Validation failure (Bad Request)",
    title: "Bad Request",
    detail: options?.detail ?? "Submitted payload failed validation",
    typeSlug: ERROR_SLUGS.BAD_REQUEST,
    code: options?.code,
    invalidParams: options?.invalidParams ?? [
      { name: "field", reason: "Invalid property value" },
    ],
  });
}

/**
 * Documents a 401 Unauthorized RFC 9457 error response.
 */
export function ApiUnauthorizedResponseRfc9457(options?: {
  description?: string;
  detail?: string;
  code?: string;
}) {
  return ApiRfc9457Response({
    status: HttpStatus.UNAUTHORIZED,
    description:
      options?.description ??
      "Authentication required or invalid token (Unauthorized)",
    title: "Unauthorized",
    detail:
      options?.detail ??
      "Authentication credentials are required or have expired",
    typeSlug: ERROR_SLUGS.UNAUTHORIZED,
    code: options?.code,
  });
}

/**
 * Documents a 403 Forbidden RFC 9457 error response.
 */
export function ApiForbiddenResponseRfc9457(options?: {
  description?: string;
  detail?: string;
  code?: string;
}) {
  return ApiRfc9457Response({
    status: HttpStatus.FORBIDDEN,
    description:
      options?.description ?? "Forbidden resource access (Forbidden)",
    title: "Forbidden",
    detail:
      options?.detail ?? "You do not have permission to perform this action",
    typeSlug: ERROR_SLUGS.FORBIDDEN,
    code: options?.code,
  });
}

/**
 * Documents a 404 Not Found RFC 9457 error response.
 */
export function ApiNotFoundResponseRfc9457(options?: {
  description?: string;
  detail?: string;
  code?: string;
}) {
  return ApiRfc9457Response({
    status: HttpStatus.NOT_FOUND,
    description: options?.description ?? "Resource not found (Not Found)",
    title: "Not Found",
    detail: options?.detail ?? "The requested resource could not be found",
    typeSlug: ERROR_SLUGS.NOT_FOUND,
    code: options?.code,
  });
}

/**
 * Documents a 409 Conflict RFC 9457 error response.
 */
export function ApiConflictResponseRfc9457(options?: {
  description?: string;
  detail?: string;
  code?: string;
}) {
  return ApiRfc9457Response({
    status: HttpStatus.CONFLICT,
    description:
      options?.description ??
      "Resource conflict or concurrency collision (Conflict)",
    title: "Conflict",
    detail:
      options?.detail ??
      "A conflict occurred with the current state of the resource",
    typeSlug: ERROR_SLUGS.CONFLICT,
    code: options?.code,
  });
}

/**
 * Documents a 422 Unprocessable Entity RFC 9457 error response.
 */
export function ApiUnprocessableEntityResponseRfc9457(options?: {
  description?: string;
  detail?: string;
  code?: string;
  invalidParams?: { name: string; reason: string }[];
}) {
  return ApiRfc9457Response({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      options?.description ??
      "Semantic validation failure (Unprocessable Entity)",
    title: "Unprocessable Entity",
    detail:
      options?.detail ??
      "The request was well-formed but could not be processed due to semantic errors",
    typeSlug: ERROR_SLUGS.UNPROCESSABLE_ENTITY,
    code: options?.code,
    invalidParams: options?.invalidParams,
  });
}

/**
 * Documents a 429 Too Many Requests RFC 9457 error response.
 */
export function ApiTooManyRequestsResponseRfc9457(options?: {
  description?: string;
  detail?: string;
  code?: string;
}) {
  return ApiRfc9457Response({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description:
      options?.description ??
      "Rate limit threshold exceeded (Too Many Requests)",
    title: "Too Many Requests",
    detail: options?.detail ?? "Too many requests. Please try again later.",
    typeSlug: ERROR_SLUGS.TOO_MANY_REQUESTS,
    code: options?.code,
  });
}

/**
 * Documents a 500 Internal Server Error RFC 9457 error response.
 */
export function ApiInternalServerErrorResponseRfc9457(options?: {
  description?: string;
  detail?: string;
  code?: string;
}) {
  return ApiRfc9457Response({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: options?.description ?? "Internal server error",
    title: "Internal Server Error",
    detail: options?.detail ?? "An unexpected internal server error occurred",
    typeSlug: ERROR_SLUGS.INTERNAL_SERVER_ERROR,
    code: options?.code,
  });
}

/**
 * Documents a 503 Service Unavailable RFC 9457 error response.
 */
export function ApiServiceUnavailableResponseRfc9457(options?: {
  description?: string;
  detail?: string;
  code?: string;
}) {
  return ApiRfc9457Response({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description:
      options?.description ?? "Upstream service temporarily unavailable",
    title: "Service Unavailable",
    detail:
      options?.detail ?? "Service is temporarily unavailable. Please retry.",
    typeSlug: ERROR_SLUGS.SERVICE_UNAVAILABLE,
    code: options?.code,
  });
}

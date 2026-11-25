import { API_ERROR_CODES, type ApiErrorCode } from "@greenroots/shared";
import type { z } from "zod";
import { resolveApiErrorMessage } from "@/constants/error-dictionary.constant";
import type { ServerActionRefreshOutcome } from "@/lib/auth/session.server";
import type { ApiProblemDetails } from "@/types/api";

/**
 * Standardized Server Action failure payload carrying RFC 9457 error code and localized Vietnamese copy.
 */
export interface BffActionFailure {
  readonly ok: false;
  readonly code: string;
  readonly message: string;
  readonly invalidParams?: ApiProblemDetails["invalidParams"];
}

/**
 * Builds a synthetic RFC 9457 Problem Details envelope when an error payload lacks structured fields.
 *
 * @param code Canonical `@greenroots/shared` error code.
 * @param instance Request path context for localization diagnostics.
 * @param status HTTP status code fallback.
 * @returns Synthetic `ApiProblemDetails` object.
 */
export function buildSyntheticProblem(
  code: ApiErrorCode,
  instance: string,
  status = 500,
): ApiProblemDetails {
  return {
    type: "/errors/auth-action",
    title: "Request Error",
    status,
    detail: "",
    instance,
    code,
  };
}

/**
 * Normalizes unknown `openapi-fetch` errors into an `ApiProblemDetails` structure.
 *
 * @param rawError Raw error value returned by `openapi-fetch`.
 * @param fallbackCode Fallback code used when `rawError` omits RFC 9457 fields.
 * @param instance Storefront route path fallback for Problem Details `instance`.
 * @returns Parsed `ApiProblemDetails` payload.
 */
export function extractProblemDetails(
  rawError: unknown,
  fallbackCode: ApiErrorCode,
  instance: string,
): ApiProblemDetails {
  if (typeof rawError !== "object" || rawError === null) {
    return buildSyntheticProblem(fallbackCode, instance);
  }

  const record = rawError as Record<string, unknown>;
  const detail = typeof record.detail === "string" ? record.detail : "";
  const code = typeof record.code === "string" ? record.code : undefined;
  const status = typeof record.status === "number" ? record.status : 500;
  const title = typeof record.title === "string" ? record.title : "Error";
  const type =
    typeof record.type === "string" ? record.type : "/errors/unknown";
  const errorInstance =
    typeof record.instance === "string" ? record.instance : instance;

  if (!code && !detail) {
    return buildSyntheticProblem(fallbackCode, errorInstance, status);
  }

  const invalidParams = Array.isArray(record.invalidParams)
    ? record.invalidParams.filter(
        (item): item is { readonly name: string; readonly reason: string } =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as { name?: unknown }).name === "string" &&
          typeof (item as { reason?: unknown }).reason === "string",
      )
    : undefined;

  return {
    type,
    title,
    status,
    detail,
    instance: errorInstance,
    code: code ?? fallbackCode,
    ...(invalidParams && invalidParams.length > 0 ? { invalidParams } : {}),
  };
}

/**
 * Converts a Zod validation error into a standardized localized Server Action failure payload.
 *
 * @param error Zod validation failure.
 * @param code RFC 9457 validation error code.
 * @param instance Route context for fallback message lookup.
 * @returns Standardized `BffActionFailure`.
 */
export function buildValidationFailure(
  error: z.ZodError,
  code: ApiErrorCode,
  instance: string,
): BffActionFailure {
  const firstMessage = error.issues.at(0)?.message;
  return {
    ok: false,
    code,
    message:
      firstMessage ??
      resolveApiErrorMessage(buildSyntheticProblem(code, instance, 400)),
  };
}

/**
 * Maps an unknown API error response to localized Vietnamese copy via `@greenroots/shared`.
 *
 * @param rawError Raw `error` field from `openapi-fetch`.
 * @param fallbackCode Fallback RFC 9457 error code.
 * @param instance Storefront route path context.
 * @returns Standardized `BffActionFailure`.
 */
export function buildActionFailure(
  rawError: unknown,
  fallbackCode: ApiErrorCode,
  instance: string,
): BffActionFailure {
  const problem = extractProblemDetails(rawError, fallbackCode, instance);
  return {
    ok: false,
    code: problem.code ?? fallbackCode,
    message: resolveApiErrorMessage(problem),
    ...(problem.invalidParams ? { invalidParams: problem.invalidParams } : {}),
  };
}

/**
 * Returns a localized network failure response when an upstream request throws before HTTP response.
 *
 * @returns Standardized `NETWORK_ERROR` failure payload.
 */
export function buildNetworkFailure(): BffActionFailure {
  return {
    ok: false,
    code: API_ERROR_CODES.NETWORK_ERROR,
    message: resolveApiErrorMessage(),
  };
}

/**
 * Identifies recoverable `401` refresh states where local `httpOnly` session cookies must remain intact.
 *
 * @param result Result returned by `runWithServerActionRefresh`.
 * @returns `true` when refresh failed transiently or overlapped with a concurrent tab rotation.
 */
export function isTransientRefreshFailure(result: {
  readonly response: Response;
  readonly refreshOutcome?: ServerActionRefreshOutcome;
}): boolean {
  return (
    result.response.status === 401 &&
    (result.refreshOutcome === "transient_error" ||
      result.refreshOutcome === "stale_concurrent")
  );
}

/**
 * Builds a localized `503 SERVICE_UNAVAILABLE` failure payload for transient BFF refresh/upstream outages.
 *
 * @param instance Storefront route path context.
 * @returns Standardized `SERVICE_UNAVAILABLE` failure payload.
 */
export function buildServiceUnavailableFailure(
  instance: string,
): BffActionFailure {
  return {
    ok: false,
    code: API_ERROR_CODES.SERVICE_UNAVAILABLE,
    message: resolveApiErrorMessage(
      buildSyntheticProblem(API_ERROR_CODES.SERVICE_UNAVAILABLE, instance, 503),
    ),
  };
}

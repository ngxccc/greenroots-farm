"use server";

import { API_ERROR_CODES, type ApiErrorCode } from "@greenroots/shared";
import type { z } from "zod";
import { resolveApiErrorMessage } from "@/constants/error-dictionary.constant";
import { api } from "@/lib/api-client";
import type { ApiProblemDetails } from "@/types/api";
import type { components } from "@/types/api-schema";
import type { StorefrontSessionUser } from "@/types/auth.types";
import {
  type LoginFormInput,
  type RegisterFormValues,
  loginFormSchema,
  registerFormSchema,
  resendVerificationFormSchema,
} from "./auth-validation";
import type { SessionTokenPair } from "./cookies";
import { setServerSessionCookies } from "./session.server";

type LoginDto = components["schemas"]["LoginDto"];
type LoginResponseDto = components["schemas"]["LoginResponseDto"];
type RegisterDto = components["schemas"]["RegisterDto"];
type ResendVerificationDto = components["schemas"]["ResendVerificationDto"];

/**
 * Discriminated result returned by `loginAction`.
 */
export type LoginActionResult =
  | { readonly ok: true; readonly user: StorefrontSessionUser | null }
  | {
      readonly ok: false;
      readonly code: string;
      readonly message: string;
      readonly unverifiedEmail?: string;
    };

/**
 * Discriminated result returned by `registerAction`.
 */
export type RegisterActionResult =
  | { readonly ok: true; readonly email: string }
  | { readonly ok: false; readonly code: string; readonly message: string };

/**
 * Discriminated result returned by `resendVerificationAction`.
 */
export type ResendVerificationActionResult =
  | { readonly ok: true; readonly message: string }
  | { readonly ok: false; readonly code: string; readonly message: string };

/**
 * Optional dependency overrides for isolated unit testing of `executeLoginAction`.
 */
export interface LoginActionDeps {
  readonly postLogin?: (body: LoginDto) => Promise<{
    data?: { data: LoginResponseDto };
    error?: unknown;
  }>;
  readonly saveCookies?: (tokens: SessionTokenPair) => Promise<void>;
  readonly fetchMe?: (accessToken: string) => Promise<{
    data?: { data: StorefrontSessionUser };
    error?: unknown;
  }>;
}

/**
 * Optional dependency overrides for isolated unit testing of `executeRegisterAction`.
 */
export interface RegisterActionDeps {
  readonly postRegister?: (body: RegisterDto) => Promise<{
    data?: unknown;
    error?: unknown;
  }>;
}

/**
 * Optional dependency overrides for isolated unit testing of `executeResendVerificationAction`.
 */
export interface ResendVerificationActionDeps {
  readonly postResend?: (body: ResendVerificationDto) => Promise<{
    data?: unknown;
    error?: unknown;
  }>;
}

function buildSyntheticProblem(
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

function extractProblemDetails(
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

  return {
    type,
    title,
    status,
    detail,
    instance: errorInstance,
    code: code ?? fallbackCode,
  };
}

function buildValidationFailure(
  error: z.ZodError,
  code: ApiErrorCode,
  instance: string,
): { readonly ok: false; readonly code: string; readonly message: string } {
  const firstMessage = error.issues.at(0)?.message;
  return {
    ok: false,
    code,
    message:
      firstMessage ??
      resolveApiErrorMessage(buildSyntheticProblem(code, instance, 400)),
  };
}

function buildActionFailure(
  rawError: unknown,
  fallbackCode: ApiErrorCode,
  instance: string,
): { readonly ok: false; readonly code: string; readonly message: string } {
  const problem = extractProblemDetails(rawError, fallbackCode, instance);
  return {
    ok: false,
    code: problem.code ?? fallbackCode,
    message: resolveApiErrorMessage(problem),
  };
}

function buildNetworkFailure(): {
  readonly ok: false;
  readonly code: string;
  readonly message: string;
} {
  return {
    ok: false,
    code: API_ERROR_CODES.NETWORK_ERROR,
    message: resolveApiErrorMessage(),
  };
}

/**
 * Executes customer credential authentication, persists `httpOnly` session cookies,
 * and hydrates the full `StorefrontSessionUser` profile using the freshly issued token.
 *
 * @param input Email and password credentials submitted from `/login`.
 * @param deps Optional injectable adapters for isolated unit testing.
 * @returns Authenticated user profile (or `null` on transient `/users/me` failure) or localized error.
 */
export async function executeLoginAction(
  input: LoginFormInput,
  deps?: LoginActionDeps,
): Promise<LoginActionResult> {
  const parsed = loginFormSchema.safeParse(input);
  if (!parsed.success) {
    return buildValidationFailure(
      parsed.error,
      API_ERROR_CODES.VALIDATION_FAILED,
      "/login",
    );
  }

  const postLogin =
    deps?.postLogin ??
    ((body: LoginDto) => api.POST("/api/v1/auth/login", { body }));

  let response: { data?: { data: LoginResponseDto }; error?: unknown };
  try {
    response = await postLogin(parsed.data);
  } catch {
    return buildNetworkFailure();
  }

  if (response.error || !response.data?.data) {
    const fallbackCode = response.error
      ? API_ERROR_CODES.AUTH_INVALID_CREDENTIALS
      : API_ERROR_CODES.INTERNAL_SERVER_ERROR;
    const failure = buildActionFailure(response.error, fallbackCode, "/login");

    if (failure.code === API_ERROR_CODES.AUTH_EMAIL_NOT_VERIFIED) {
      return {
        ...failure,
        unverifiedEmail: parsed.data.email,
      };
    }

    return failure;
  }

  const { accessToken, refreshToken } = response.data.data;
  const saveCookies = deps?.saveCookies ?? setServerSessionCookies;
  await saveCookies({ accessToken, refreshToken });

  const fetchMe =
    deps?.fetchMe ??
    ((token: string) =>
      api.GET("/api/v1/users/me", {
        headers: { Authorization: `Bearer ${token}` },
      }));

  // Pass the freshly issued bearer token explicitly because cookies() in the same action invocation may lag.
  try {
    const profileResult = await fetchMe(accessToken);
    if (!profileResult.error && profileResult.data?.data) {
      return { ok: true, user: profileResult.data.data };
    }
  } catch {
    // Preserve persisted session cookies and let router.refresh() hydrate HeaderAuthSlot.
  }

  return { ok: true, user: null };
}

/**
 * Validates customer registration inputs, omits blank optional phone numbers,
 * and registers an unverified account via `POST /api/v1/auth/register`.
 *
 * @param input Registration form values including confirmation and terms consent.
 * @param deps Optional injectable adapters for isolated unit testing.
 * @returns Normalized email for inline verification instructions or localized error.
 */
export async function executeRegisterAction(
  input: RegisterFormValues,
  deps?: RegisterActionDeps,
): Promise<RegisterActionResult> {
  const parsed = registerFormSchema.safeParse(input);
  if (!parsed.success) {
    return buildValidationFailure(
      parsed.error,
      API_ERROR_CODES.VALIDATION_FAILED,
      "/register",
    );
  }

  const { fullName, phone, email, password, confirmPassword, agreeTerms } =
    parsed.data;

  const payload: RegisterDto = {
    fullName,
    email,
    password,
    confirmPassword,
    agreeTerms,
    ...(phone ? { phone } : {}),
  };

  const postRegister =
    deps?.postRegister ??
    ((body: RegisterDto) => api.POST("/api/v1/auth/register", { body }));

  try {
    const response = await postRegister(payload);
    if (response.error) {
      return buildActionFailure(
        response.error,
        API_ERROR_CODES.BAD_REQUEST,
        "/register",
      );
    }
    return { ok: true, email };
  } catch {
    return buildNetworkFailure();
  }
}

/**
 * Triggers a fresh activation email via `POST /api/v1/auth/resend-verification`.
 *
 * @param input Target account email address.
 * @param deps Optional injectable adapters for isolated unit testing.
 * @returns Success feedback or localized rate-limit/network error.
 */
export async function executeResendVerificationAction(
  input: { readonly email: string },
  deps?: ResendVerificationActionDeps,
): Promise<ResendVerificationActionResult> {
  const parsed = resendVerificationFormSchema.safeParse(input);
  if (!parsed.success) {
    return buildValidationFailure(
      parsed.error,
      API_ERROR_CODES.INVALID_EMAIL,
      "/resend-verification",
    );
  }

  const postResend =
    deps?.postResend ??
    ((body: ResendVerificationDto) =>
      api.POST("/api/v1/auth/resend-verification", { body }));

  try {
    const response = await postResend(parsed.data);
    if (response.error) {
      return buildActionFailure(
        response.error,
        API_ERROR_CODES.BAD_REQUEST,
        "/resend-verification",
      );
    }

    return {
      ok: true,
      message: `Đã gửi lại liên kết xác thực tới ${parsed.data.email}. Vui lòng kiểm tra hộp thư.`,
    };
  } catch {
    return buildNetworkFailure();
  }
}

/**
 * Next.js Server Action handling customer login from `/login`.
 */
export async function loginAction(
  input: LoginFormInput,
): Promise<LoginActionResult> {
  return executeLoginAction(input);
}

/**
 * Next.js Server Action handling customer registration from `/register`.
 */
export async function registerAction(
  input: RegisterFormValues,
): Promise<RegisterActionResult> {
  return executeRegisterAction(input);
}

/**
 * Next.js Server Action handling verification email resends from `/login` and `/register`.
 */
export async function resendVerificationAction(input: {
  readonly email: string;
}): Promise<ResendVerificationActionResult> {
  return executeResendVerificationAction(input);
}

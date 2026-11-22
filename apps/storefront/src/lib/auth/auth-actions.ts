"use server";

import { API_ERROR_CODES, type ApiErrorCode } from "@greenroots/shared";
import type { z } from "zod";
import { resolveApiErrorMessage } from "@/constants/error-dictionary.constant";
import { api } from "@/lib/api-client";
import type { ApiProblemDetails } from "@/types/api";
import type { components } from "@/types/api-schema";
import type { StorefrontSessionUser } from "@/types/auth.types";
import {
  type ForgotPasswordFormInput,
  type LoginFormInput,
  type RegisterFormValues,
  type ResetPasswordFormInput,
  type VerifyEmailInput,
  forgotPasswordFormSchema,
  loginFormSchema,
  registerFormSchema,
  resendVerificationFormSchema,
  resetPasswordFormSchema,
  verifyEmailSchema,
} from "./auth-validation";
import type { SessionTokenPair } from "./cookies";
import {
  clearServerSessionCookies,
  setServerSessionCookies,
} from "./session.server";

type ForgotPasswordDto = components["schemas"]["ForgotPasswordDto"];
type LoginDto = components["schemas"]["LoginDto"];
type LoginResponseDto = components["schemas"]["LoginResponseDto"];
type RegisterDto = components["schemas"]["RegisterDto"];
type ResendVerificationDto = components["schemas"]["ResendVerificationDto"];
type ResetPasswordDto = components["schemas"]["ResetPasswordDto"];
type VerifyEmailDto = components["schemas"]["VerifyEmailDto"];

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
 * Shared discriminated result returned by void auth feedback actions.
 */
export type AuthFeedbackActionResult =
  | { readonly ok: true; readonly message: string }
  | { readonly ok: false; readonly code: string; readonly message: string };

/**
 * Discriminated result returned by `resendVerificationAction`.
 */
export type ResendVerificationActionResult = AuthFeedbackActionResult;

/**
 * Discriminated result returned by `verifyEmailAction`.
 */
export type VerifyEmailActionResult = AuthFeedbackActionResult;

/**
 * Discriminated result returned by `forgotPasswordAction`.
 */
export type ForgotPasswordActionResult = AuthFeedbackActionResult;

/**
 * Discriminated result returned by `resetPasswordAction`.
 */
export type ResetPasswordActionResult = AuthFeedbackActionResult;

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

/**
 * Optional dependency overrides for isolated unit testing of `executeVerifyEmailAction`.
 */
export interface VerifyEmailActionDeps {
  readonly postVerify?: (body: VerifyEmailDto) => Promise<{
    data?: unknown;
    error?: unknown;
  }>;
}

/**
 * Optional dependency overrides for isolated unit testing of `executeForgotPasswordAction`.
 */
export interface ForgotPasswordActionDeps {
  readonly postForgotPassword?: (body: ForgotPasswordDto) => Promise<{
    data?: unknown;
    error?: unknown;
  }>;
}

/**
 * Optional dependency overrides for isolated unit testing of `executeResetPasswordAction`.
 */
export interface ResetPasswordActionDeps {
  readonly postResetPassword?: (body: ResetPasswordDto) => Promise<{
    data?: unknown;
    error?: unknown;
  }>;
  readonly clearCookies?: () => Promise<void>;
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

async function executeValidatedVoidAuthPost<TPayload>(params: {
  readonly input: unknown;
  readonly schema: z.ZodType<TPayload>;
  readonly validationCode: ApiErrorCode;
  readonly fallbackErrorCode: ApiErrorCode;
  readonly instance: string;
  readonly successMessage: string;
  readonly post: (body: TPayload) => Promise<{
    data?: unknown;
    error?: unknown;
  }>;
  readonly onSuccess?: () => Promise<void>;
}): Promise<AuthFeedbackActionResult> {
  const parsed = params.schema.safeParse(params.input);
  if (!parsed.success) {
    return buildValidationFailure(
      parsed.error,
      params.validationCode,
      params.instance,
    );
  }

  try {
    const response = await params.post(parsed.data);
    if (response.error) {
      return buildActionFailure(
        response.error,
        params.fallbackErrorCode,
        params.instance,
      );
    }

    if (params.onSuccess) {
      await params.onSuccess();
    }

    return {
      ok: true,
      message: params.successMessage,
    };
  } catch {
    return buildNetworkFailure();
  }
}

/**
 * Triggers a fresh activation email via `POST /api/v1/auth/resend-verification`.
 * Returns neutral anti-enumeration copy matching backend silence for verified or missing accounts.
 *
 * @param input Target account email address.
 * @param deps Optional injectable adapters for isolated unit testing.
 * @returns Neutral confirmation feedback or localized validation/rate-limit error.
 */
export async function executeResendVerificationAction(
  input: { readonly email: string },
  deps?: ResendVerificationActionDeps,
): Promise<ResendVerificationActionResult> {
  const postResend =
    deps?.postResend ??
    ((body: ResendVerificationDto) =>
      api.POST("/api/v1/auth/resend-verification", { body }));

  return executeValidatedVoidAuthPost({
    input,
    schema: resendVerificationFormSchema,
    validationCode: API_ERROR_CODES.INVALID_EMAIL,
    fallbackErrorCode: API_ERROR_CODES.BAD_REQUEST,
    instance: "/resend-verification",
    successMessage:
      "Nếu email đã đăng ký và chưa được xác thực, hệ thống đã gửi liên kết kích hoạt mới. Vui lòng kiểm tra hộp thư hoặc thư mục Spam.",
    post: postResend,
  });
}

/**
 * Verifies a customer email activation token via `POST /api/v1/auth/verify-email`.
 *
 * @param input Verification token payload extracted from `/verify-email?token=...`.
 * @param deps Optional injectable adapters for isolated unit testing.
 * @returns Confirmation message or localized token/network error.
 */
export async function executeVerifyEmailAction(
  input: VerifyEmailInput,
  deps?: VerifyEmailActionDeps,
): Promise<VerifyEmailActionResult> {
  const postVerify =
    deps?.postVerify ??
    ((body: VerifyEmailDto) => api.POST("/api/v1/auth/verify-email", { body }));

  return executeValidatedVoidAuthPost({
    input,
    schema: verifyEmailSchema,
    validationCode: API_ERROR_CODES.AUTH_VERIFICATION_TOKEN_INVALID,
    fallbackErrorCode: API_ERROR_CODES.AUTH_VERIFICATION_TOKEN_INVALID,
    instance: "/verify-email",
    successMessage:
      "Xác thực email thành công. Bạn đã có thể đăng nhập vào tài khoản GreenRoots Farm.",
    post: postVerify,
  });
}

/**
 * Requests a 15-minute password recovery email via `POST /api/v1/auth/forgot-password`
 * with fixed anti-enumeration confirmation wording.
 *
 * @param input Email payload submitted from `/forgot-password`.
 * @param deps Optional injectable adapters for isolated unit testing.
 * @returns Neutral anti-enumeration message or localized validation/rate-limit error.
 */
export async function executeForgotPasswordAction(
  input: ForgotPasswordFormInput,
  deps?: ForgotPasswordActionDeps,
): Promise<ForgotPasswordActionResult> {
  const postForgotPassword =
    deps?.postForgotPassword ??
    ((body: ForgotPasswordDto) =>
      api.POST("/api/v1/auth/forgot-password", { body }));

  return executeValidatedVoidAuthPost({
    input,
    schema: forgotPasswordFormSchema,
    validationCode: API_ERROR_CODES.INVALID_EMAIL,
    fallbackErrorCode: API_ERROR_CODES.BAD_REQUEST,
    instance: "/forgot-password",
    successMessage:
      "Liên kiết đặt lại mật khẩu sẽ được gửi vào địa chỉ email nếu tồn tại trên hệ thống. Liên kết có hiệu lực trong 15 phút — vui lòng kiểm tra hộp thư đến hoặc Spam.",
    post: postForgotPassword,
  });
}

/**
 * Submits a password reset via `POST /api/v1/auth/reset-password` and clears local Storefront
 * `httpOnly` session cookies immediately upon success to match backend global revocation.
 *
 * @param input Token, password, and password confirmation submitted from `/reset-password`.
 * @param deps Optional injectable adapters for isolated unit testing.
 * @returns Success message noting global session revocation or localized error.
 */
export async function executeResetPasswordAction(
  input: ResetPasswordFormInput,
  deps?: ResetPasswordActionDeps,
): Promise<ResetPasswordActionResult> {
  const postResetPassword =
    deps?.postResetPassword ??
    ((body: ResetPasswordDto) =>
      api.POST("/api/v1/auth/reset-password", { body }));
  const clearCookies = deps?.clearCookies ?? clearServerSessionCookies;

  return executeValidatedVoidAuthPost({
    input,
    schema: resetPasswordFormSchema,
    validationCode: API_ERROR_CODES.VALIDATION_FAILED,
    fallbackErrorCode: API_ERROR_CODES.AUTH_RESET_TOKEN_INVALID,
    instance: "/reset-password",
    successMessage:
      "Mật khẩu đã được cập nhật thành công. Toàn bộ phiên đăng nhập trước đó trên mọi thiết bị đã được đăng xuất.",
    post: postResetPassword,
    onSuccess: clearCookies,
  });
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
 * Next.js Server Action handling verification email resends from `/login`, `/register`, and `/verify-email`.
 */
export async function resendVerificationAction(input: {
  readonly email: string;
}): Promise<ResendVerificationActionResult> {
  return executeResendVerificationAction(input);
}

/**
 * Next.js Server Action verifying an email activation token from `/verify-email`.
 */
export async function verifyEmailAction(
  input: VerifyEmailInput,
): Promise<VerifyEmailActionResult> {
  return executeVerifyEmailAction(input);
}

/**
 * Next.js Server Action requesting a password reset email from `/forgot-password`.
 */
export async function forgotPasswordAction(
  input: ForgotPasswordFormInput,
): Promise<ForgotPasswordActionResult> {
  return executeForgotPasswordAction(input);
}

/**
 * Next.js Server Action updating customer password from `/reset-password` and clearing local cookies.
 */
export async function resetPasswordAction(
  input: ResetPasswordFormInput,
): Promise<ResetPasswordActionResult> {
  return executeResetPasswordAction(input);
}

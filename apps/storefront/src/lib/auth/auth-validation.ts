import { z } from "zod";

/**
 * Vietnamese 10-digit mobile phone pattern matching `apps/api` `VN_PHONE_REGEX`.
 */
export const VN_PHONE_REGEX = /^(0[35789])\d{8}$/;

/**
 * Maximum token length matching `apps/api` verification and reset token DTOs.
 */
export const RECOVERY_TOKEN_MAX_LENGTH = 64;

/**
 * Cooldown duration in seconds enforced between verification email resend attempts
 * and repeated password-reset requests.
 */
export const RESEND_VERIFICATION_COOLDOWN_SECONDS = 60;
export const FORGOT_PASSWORD_COOLDOWN_SECONDS =
  RESEND_VERIFICATION_COOLDOWN_SECONDS;

/**
 * Minimum and maximum password length matching `apps/api` `zPassword()`.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Evaluation breakdown of the backend OWASP password complexity policy.
 */
export interface PasswordRuleEvaluation {
  readonly minLength: boolean;
  readonly maxLength: boolean;
  readonly hasUppercase: boolean;
  readonly hasNumber: boolean;
  readonly hasSpecial: boolean;
  readonly isValid: boolean;
}

/**
 * Strips whitespace from an optional phone input and returns `undefined` when blank
 * so `RegisterDto.phone` is omitted rather than transmitted as an empty string.
 *
 * @param raw Optional phone input string from form state.
 * @returns Normalized phone digits without whitespace, or `undefined` if empty.
 */
export function normalizeOptionalPhone(
  raw: string | null | undefined,
): string | undefined {
  if (!raw) {
    return undefined;
  }

  const stripped = raw.replace(/\s+/g, "").trim();
  return stripped.length > 0 ? stripped : undefined;
}

/**
 * Evaluates a candidate password against every criterion enforced by `apps/api` `zPassword()`.
 *
 * @param password Candidate password string.
 * @returns Boolean status flags per policy criterion and overall validity.
 */
export function evaluatePasswordRules(
  password: string,
): PasswordRuleEvaluation {
  const minLength = password.length >= PASSWORD_MIN_LENGTH;
  const maxLength = password.length <= PASSWORD_MAX_LENGTH;
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);

  return {
    minLength,
    maxLength,
    hasUppercase,
    hasNumber,
    hasSpecial,
    isValid: minLength && maxLength && hasUppercase && hasNumber && hasSpecial,
  };
}

/**
 * Advances the resend-verification cooldown timer by one second, clamping at zero.
 *
 * @param remainingSeconds Current cooldown counter in seconds.
 * @returns Next cooldown value in seconds (`>= 0`).
 */
export function decrementCooldownSeconds(remainingSeconds: number): number {
  if (!Number.isFinite(remainingSeconds) || remainingSeconds <= 1) {
    return 0;
  }
  return Math.floor(remainingSeconds) - 1;
}

/**
 * Formats a localized countdown label shared across cooldown-protected auth buttons.
 *
 * @param remainingSeconds Remaining cooldown seconds (`0` when ready).
 * @param idleLabel Label rendered when no cooldown is active.
 * @returns Localized active countdown or idle button label.
 */
export function formatActionCooldownLabel(
  remainingSeconds: number,
  idleLabel: string,
): string {
  return remainingSeconds > 0
    ? `Gửi lại sau ${Math.ceil(remainingSeconds)}s`
    : idleLabel;
}

/**
 * Formats the Vietnamese resend verification button label for active or idle cooldown states.
 *
 * @param remainingSeconds Remaining cooldown seconds (`0` when ready).
 * @returns Localized button label.
 */
export function formatResendCooldownLabel(remainingSeconds: number): string {
  return formatActionCooldownLabel(remainingSeconds, "Gửi lại email xác thực");
}

/**
 * Formats the Vietnamese forgot-password submit button label for active or idle cooldown states.
 *
 * @param remainingSeconds Remaining cooldown seconds (`0` when ready).
 * @returns Localized button label.
 */
export function formatForgotPasswordCooldownLabel(
  remainingSeconds: number,
): string {
  return formatActionCooldownLabel(
    remainingSeconds,
    "Gửi lại liên kết khôi phục",
  );
}

/**
 * Extracts the first string value from a Next.js query parameter (`string | string[] | undefined`).
 *
 * @param value Raw query parameter value from Next.js `searchParams`.
 * @returns First string entry when present, or `undefined`.
 */
export function extractFirstQueryValue(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

/**
 * Shared localized Vietnamese error message for invalid mobile phone inputs.
 */
export const VN_PHONE_ERROR_MESSAGE =
  "Số điện thoại không hợp lệ (yêu cầu 10 chữ số bắt đầu bằng 03, 05, 07, 08 hoặc 09).";

/**
 * Maximum normalized character length for `fullName` matching `UpdateProfileDto`.
 */
export const PROFILE_FULL_NAME_MAX_LENGTH = 100;

/**
 * Collapses repeated whitespace and trims leading/trailing spacing on customer full names.
 *
 * @param raw Raw full-name input string.
 * @returns Normalized single-spaced name string.
 */
export function normalizeProfileFullName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

const fullNameFieldSchema = z
  .string()
  .transform(normalizeProfileFullName)
  .refine((value) => value.length >= 1, {
    message: "Vui lòng nhập họ và tên.",
  })
  .refine((value) => value.length <= PROFILE_FULL_NAME_MAX_LENGTH, {
    message: `Họ và tên không được vượt quá ${PROFILE_FULL_NAME_MAX_LENGTH} ký tự.`,
  });

const emailFieldSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: "Địa chỉ email không đúng định dạng." }));

const recoveryTokenFieldSchema = z
  .string()
  .trim()
  .min(1, { message: "Liên kết xác thực không hợp lệ hoặc bị thiếu." })
  .max(RECOVERY_TOKEN_MAX_LENGTH, {
    message: "Mã xác thực không hợp lệ hoặc đã hết hạn.",
  });

const owaspPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, {
    message: `Mật khẩu phải có ít nhất ${PASSWORD_MIN_LENGTH} ký tự.`,
  })
  .max(PASSWORD_MAX_LENGTH, {
    message: `Mật khẩu không được vượt quá ${PASSWORD_MAX_LENGTH} ký tự.`,
  })
  .regex(/[A-Z]/, {
    message: "Mật khẩu phải có ít nhất 1 chữ cái viết hoa.",
  })
  .regex(/[0-9]/, {
    message: "Mật khẩu phải có ít nhất 1 chữ số.",
  })
  .regex(/[^a-zA-Z0-9]/, {
    message: "Mật khẩu phải có ít nhất 1 ký tự đặc biệt.",
  });

const confirmPasswordFieldSchema = z.string().min(PASSWORD_MIN_LENGTH, {
  message: `Mật khẩu xác nhận phải có ít nhất ${PASSWORD_MIN_LENGTH} ký tự.`,
});

/**
 * Parses a candidate `?token=` query parameter for email verification and password reset pages.
 *
 * @param raw Raw `token` query parameter from Next.js `searchParams`.
 * @returns Trimmed token string when length is within `1..64`, otherwise `null`.
 */
export function parseRecoveryTokenParam(
  raw: string | string[] | undefined,
): string | null {
  const candidate = extractFirstQueryValue(raw);
  if (!candidate) {
    return null;
  }

  const parsed = recoveryTokenFieldSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/**
 * Extracts and normalizes an optional `?email=` query parameter for resend prefill convenience.
 *
 * @param raw Raw `email` query parameter from Next.js `searchParams`.
 * @returns Normalized email string when syntactically valid, otherwise empty string.
 */
export function parsePrefillEmailParam(
  raw: string | string[] | undefined,
): string {
  const candidate = extractFirstQueryValue(raw);
  if (!candidate) {
    return "";
  }

  const parsed = emailFieldSchema.safeParse(candidate);
  return parsed.success ? parsed.data : "";
}

/**
 * Client and Server Action validation schema matching `apps/api` `loginSchema.strict()`.
 */
export const loginFormSchema = z
  .object({
    email: emailFieldSchema,
    password: z
      .string()
      .min(1, { message: "Vui lòng nhập mật khẩu." })
      .max(PASSWORD_MAX_LENGTH, {
        message: `Mật khẩu không được vượt quá ${PASSWORD_MAX_LENGTH} ký tự.`,
      }),
  })
  .strict();

/**
 * Validated login form payload.
 */
export type LoginFormInput = z.infer<typeof loginFormSchema>;

/**
 * Client and Server Action validation schema matching `apps/api` `registerSchema.strict()`.
 */
export const registerFormSchema = z
  .object({
    fullName: fullNameFieldSchema,
    phone: z
      .string()
      .optional()
      .transform((value) => normalizeOptionalPhone(value))
      .refine(
        (value) => value === undefined || VN_PHONE_REGEX.test(value),
        VN_PHONE_ERROR_MESSAGE,
      ),
    email: emailFieldSchema,
    password: owaspPasswordSchema,
    confirmPassword: confirmPasswordFieldSchema,
    agreeTerms: z.literal(true, {
      message: "Vui lòng đồng ý với Điều khoản sử dụng và Chính sách bảo mật.",
    }),
  })
  .strict()
  .refine((data) => data.password === data.confirmPassword, {
    message: "Mật khẩu xác nhận không khớp.",
    path: ["confirmPassword"],
  });

/**
 * Raw registration form input before normalization.
 */
export interface RegisterFormValues {
  readonly fullName: string;
  readonly phone?: string;
  readonly email: string;
  readonly password: string;
  readonly confirmPassword: string;
  readonly agreeTerms: boolean;
}

/**
 * Schema validating verification email resend requests matching `resendVerificationSchema.strict()`.
 */
export const resendVerificationFormSchema = z
  .object({
    email: emailFieldSchema,
  })
  .strict();

/**
 * Schema validating email verification token submissions matching `verifyEmailSchema.strict()`.
 */
export const verifyEmailSchema = z
  .object({
    token: recoveryTokenFieldSchema,
  })
  .strict();

/**
 * Validated email verification token payload.
 */
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

/**
 * Schema validating forgot-password requests matching `forgotPasswordSchema.strict()`.
 */
export const forgotPasswordFormSchema = z
  .object({
    email: emailFieldSchema,
  })
  .strict();

/**
 * Validated forgot-password form payload.
 */
export type ForgotPasswordFormInput = z.infer<typeof forgotPasswordFormSchema>;

/**
 * Schema validating password reset submissions matching `resetPasswordSchema.strict()`.
 */
export const resetPasswordFormSchema = z
  .object({
    token: recoveryTokenFieldSchema,
    password: owaspPasswordSchema,
    confirmPassword: confirmPasswordFieldSchema,
  })
  .strict()
  .refine((data) => data.password === data.confirmPassword, {
    message: "Mật khẩu xác nhận không khớp.",
    path: ["confirmPassword"],
  });

/**
 * Validated password reset submission payload.
 */
export type ResetPasswordFormInput = z.infer<typeof resetPasswordFormSchema>;

/**
 * Strips whitespace from optional phone input and converts blank strings to `null`
 * so `PATCH /api/v1/users/me` clears `users.phone` explicitly (`INV-PROFILE-6`).
 *
 * @param raw Raw phone string, `null`, or `undefined`.
 * @returns Stripped phone digits or `null` when empty.
 */
export function normalizeProfilePhoneInput(
  raw: string | null | undefined,
): string | null {
  return normalizeOptionalPhone(raw) ?? null;
}

/**
 * Form schema validating editable profile inputs (`fullName` + optional clearable `phone`)
 * aligned with `apps/api` `UpdateProfileDto` rules (`INV-PROFILE-6`, `INV-PROFILE-7`).
 */
export const profileFormSchema = z
  .object({
    fullName: fullNameFieldSchema,
    phone: z
      .string()
      .nullable()
      .optional()
      .transform((value) => normalizeProfilePhoneInput(value))
      .refine((value) => value === null || VN_PHONE_REGEX.test(value), {
        message: VN_PHONE_ERROR_MESSAGE,
      }),
  })
  .strict();

/**
 * Strict Server Action payload schema mirroring `apps/api` `updateProfileSchema.strict()`.
 */
export const updateProfilePatchSchema = z
  .object({
    fullName: fullNameFieldSchema.optional(),
    phone: z
      .union([
        z.null(),
        z.string().trim().regex(VN_PHONE_REGEX, {
          message: VN_PHONE_ERROR_MESSAGE,
        }),
      ])
      .optional(),
  })
  .strict()
  .refine((data) => data.fullName !== undefined || data.phone !== undefined, {
    message: "Vui lòng thay đổi ít nhất một thông tin trước khi lưu.",
  });

/**
 * Partial profile update payload sent to `PATCH /api/v1/users/me`.
 */
export type UpdateProfilePatch = z.infer<typeof updateProfilePatchSchema>;

/**
 * Result returned when computing dirty changes for the self-service profile form.
 */
export type ProfileDiffResult =
  | { readonly ok: true; readonly patch: UpdateProfilePatch | null }
  | { readonly ok: false; readonly message: string };

/**
 * Validates customer profile form fields and returns only changed attributes
 * against the server baseline so no-op `{}` writes are prevented upfront (`INV-PROFILE-5`).
 *
 * @param baseline Current persisted `fullName` and `phone` from `UserProfileDto`.
 * @param next Raw form field values edited by the customer.
 * @returns Minimal changed `UpdateProfilePatch`, `null` if unchanged, or localized error.
 */
export function buildUpdateProfileDiff(
  baseline: { readonly fullName: string; readonly phone: string | null },
  next: { readonly fullName: string; readonly phone?: string | null },
): ProfileDiffResult {
  const parsed = profileFormSchema.safeParse(next);
  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues.at(0)?.message ??
        "Vui lòng kiểm tra lại thông tin hồ sơ.",
    };
  }

  const normalizedBaselineName = normalizeProfileFullName(baseline.fullName);
  const normalizedBaselinePhone = normalizeProfilePhoneInput(baseline.phone);

  const patch: { fullName?: string; phone?: string | null } = {};
  if (parsed.data.fullName !== normalizedBaselineName) {
    patch.fullName = parsed.data.fullName;
  }
  if (parsed.data.phone !== normalizedBaselinePhone) {
    patch.phone = parsed.data.phone;
  }

  if (patch.fullName === undefined && patch.phone === undefined) {
    return { ok: true, patch: null };
  }

  return { ok: true, patch };
}

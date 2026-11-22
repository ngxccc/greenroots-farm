"use client";

import Link from "next/link";
import { useState, type ChangeEvent, type SubmitEvent } from "react";
import { Button, Checkbox, Input, Label } from "@greenroots/ui";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Loader2,
  MailCheck,
} from "lucide-react";
import { registerAction } from "@/lib/auth/auth-actions";
import {
  evaluatePasswordRules,
  registerFormSchema,
} from "@/lib/auth/auth-validation";
import { sanitizeRedirectPath } from "@/lib/auth/cookies";
import { AuthAlertBanner } from "./auth-alert-banner";
import {
  AUTH_INPUT_CLASS,
  AUTH_LABEL_CLASS,
  AUTH_PRIMARY_BUTTON_CLASS,
} from "./auth-styles";
import { PasswordField } from "./password-field";
import { ResendVerificationControl } from "./resend-verification-control";

interface RegisterFormProps {
  readonly redirectTo?: string;
}

type RegisterFieldKey =
  | "fullName"
  | "phone"
  | "email"
  | "password"
  | "confirmPassword"
  | "agreeTerms";

/**
 * Customer registration form enforcing backend OWASP password rules, optional whitespace-normalized
 * phone validation, and inline post-registration email verification guidance.
 */
export function RegisterForm({ redirectTo = "/" }: RegisterFormProps) {
  const safeRedirectTo = sanitizeRedirectPath(redirectTo);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);

  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<RegisterFieldKey, string>>
  >({});
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);

  const loginHref =
    safeRedirectTo !== "/"
      ? `/login?redirect=${encodeURIComponent(safeRedirectTo)}`
      : "/login";

  const passwordRules = evaluatePasswordRules(password);
  const passwordChecklist = [
    {
      label: "Từ 8 đến 128 ký tự",
      met: passwordRules.minLength && passwordRules.maxLength,
    },
    {
      label: "Ít nhất 1 chữ cái viết hoa (A–Z)",
      met: passwordRules.hasUppercase,
    },
    { label: "Ít nhất 1 chữ số (0–9)", met: passwordRules.hasNumber },
    { label: "Ít nhất 1 ký tự đặc biệt", met: passwordRules.hasSpecial },
  ] as const;

  function clearFieldError(field: RegisterFieldKey) {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    }
    if (errorMessage) {
      setErrorMessage(null);
    }
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) {
      return;
    }

    setErrorMessage(null);
    setFieldErrors({});

    const parsed = registerFormSchema.safeParse({
      fullName,
      phone,
      email,
      password,
      confirmPassword,
      agreeTerms,
    });

    if (!parsed.success) {
      const nextFieldErrors: Partial<Record<RegisterFieldKey, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !(key in nextFieldErrors)) {
          nextFieldErrors[key as RegisterFieldKey] = issue.message;
        }
      }
      setFieldErrors(nextFieldErrors);
      setErrorMessage(
        parsed.error.issues[0]?.message ??
          "Vui lòng kiểm tra lại thông tin đăng ký.",
      );
      return;
    }

    setIsPending(true);
    try {
      const result = await registerAction({
        fullName,
        phone,
        email,
        password,
        confirmPassword,
        agreeTerms,
      });

      if (result.ok) {
        setPassword("");
        setConfirmPassword("");
        setRegisteredEmail(result.email);
        return;
      }

      setErrorMessage(result.message);
    } catch {
      setErrorMessage("Không thể kết nối tới máy chủ GreenRoots Farm.");
    } finally {
      setIsPending(false);
    }
  }

  if (registeredEmail) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-green-50 text-brand-forest">
          <MailCheck className="size-8" aria-hidden="true" />
        </span>

        <div className="flex flex-col gap-2">
          <h1 className="text-[22px] leading-7.5 font-bold tracking-tight text-gray-900 md:text-[28px] md:leading-9">
            Xác thực địa chỉ email
          </h1>
          <p className="text-[13px] leading-4.5 text-balance text-gray-500">
            Chúng tôi đã gửi liên kết kích hoạt tài khoản tới địa chỉ:
          </p>
          <p className="text-[15px] font-semibold text-gray-900">
            {registeredEmail}
          </p>
        </div>

        <div className="flex w-full flex-col gap-1 rounded-lg border border-border-subtle bg-surface-warm p-4 text-left">
          <span className="text-xs font-semibold text-gray-900">
            Chưa thấy email xác thực?
          </span>
          <p className="text-[13px] leading-4.5 text-pretty text-gray-500">
            Kiểm tra thư mục Quảng cáo hoặc Spam, hoặc bấm nút bên dưới để gửi
            lại liên kết mới.
          </p>
        </div>

        <div className="w-full">
          <ResendVerificationControl
            email={registeredEmail}
            variant="default"
          />
        </div>

        <div className="flex w-full flex-col items-center gap-2.5 border-t border-border-subtle pt-4">
          <Link
            href={loginHref}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-forest hover:underline focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:outline-none"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            <span>Quay lại đăng nhập</span>
          </Link>

          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 transition-colors hover:text-brand-forest focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:outline-none"
          >
            <span>Về trang chủ GreenRoots Farm</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px] leading-7.5 font-bold tracking-tight text-gray-900 md:text-[28px] md:leading-9">
          Đăng ký tài khoản
        </h1>
        <p className="text-[13px] leading-4.5 text-balance text-gray-500">
          Nhận ưu đãi đơn đầu tiên và theo dõi độ tươi rau củ mỗi ngày.
        </p>
      </div>

      {errorMessage ? (
        <AuthAlertBanner variant="error" message={errorMessage} />
      ) : null}

      <form
        noValidate
        onSubmit={(e) => void handleSubmit(e)}
        className="flex flex-col gap-3"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="register-fullname" className={AUTH_LABEL_CLASS}>
            Họ và tên
          </Label>
          <Input
            id="register-fullname"
            type="text"
            value={fullName}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              setFullName(event.target.value);
              clearFieldError("fullName");
            }}
            placeholder="Nguyễn Minh Anh"
            autoComplete="name"
            disabled={isPending}
            aria-invalid={Boolean(fieldErrors.fullName)}
            aria-describedby={
              fieldErrors.fullName ? "register-fullname-error" : undefined
            }
            className={AUTH_INPUT_CLASS}
          />
          {fieldErrors.fullName ? (
            <p
              id="register-fullname-error"
              className="text-xs text-status-spoiled"
            >
              {fieldErrors.fullName}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="register-phone"
              className={`${AUTH_LABEL_CLASS} gap-1`}
            >
              Số điện thoại
              <span className="font-normal text-gray-500">(tùy chọn)</span>
            </Label>
            <Input
              id="register-phone"
              type="tel"
              value={phone}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setPhone(event.target.value);
                clearFieldError("phone");
              }}
              placeholder="0908 412 679"
              autoComplete="tel"
              disabled={isPending}
              aria-invalid={Boolean(fieldErrors.phone)}
              aria-describedby={
                fieldErrors.phone ? "register-phone-error" : undefined
              }
              className={`${AUTH_INPUT_CLASS} tabular-nums`}
            />
            {fieldErrors.phone ? (
              <p
                id="register-phone-error"
                className="text-xs text-status-spoiled"
              >
                {fieldErrors.phone}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="register-email" className={AUTH_LABEL_CLASS}>
              Email
            </Label>
            <Input
              id="register-email"
              type="email"
              value={email}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setEmail(event.target.value);
                clearFieldError("email");
              }}
              placeholder="minhanh@email.com"
              autoComplete="email"
              disabled={isPending}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={
                fieldErrors.email ? "register-email-error" : undefined
              }
              className={AUTH_INPUT_CLASS}
            />
            {fieldErrors.email ? (
              <p
                id="register-email-error"
                className="text-xs text-status-spoiled"
              >
                {fieldErrors.email}
              </p>
            ) : null}
          </div>
        </div>

        <PasswordField
          id="register-password"
          label="Mật khẩu"
          value={password}
          onChange={(value) => {
            setPassword(value);
            clearFieldError("password");
          }}
          placeholder="Tối thiểu 8 ký tự"
          autoComplete="new-password"
          disabled={isPending}
          invalid={Boolean(fieldErrors.password)}
          errorMessage={fieldErrors.password}
        />

        <ul
          aria-label="Yêu cầu mật khẩu"
          className="grid grid-cols-1 gap-1 rounded-lg border border-border-subtle bg-surface-warm px-3 py-2 sm:grid-cols-2"
        >
          {passwordChecklist.map((rule) => (
            <li
              key={rule.label}
              className={`flex items-center gap-1.5 text-[11px] leading-4 ${
                rule.met ? "font-medium text-status-fresh" : "text-gray-500"
              }`}
            >
              {rule.met ? (
                <CheckCircle2
                  className="size-3.5 shrink-0"
                  aria-hidden="true"
                />
              ) : (
                <Circle className="size-3.5 shrink-0" aria-hidden="true" />
              )}
              <span>{rule.label}</span>
            </li>
          ))}
        </ul>

        <PasswordField
          id="register-confirm-password"
          label="Xác nhận mật khẩu"
          value={confirmPassword}
          onChange={(value) => {
            setConfirmPassword(value);
            clearFieldError("confirmPassword");
          }}
          placeholder="Nhập lại mật khẩu"
          autoComplete="new-password"
          disabled={isPending}
          showLabel="Hiện xác nhận mật khẩu"
          hideLabel="Ẩn xác nhận mật khẩu"
          invalid={Boolean(fieldErrors.confirmPassword)}
          errorMessage={fieldErrors.confirmPassword}
        />

        <div className="flex flex-col gap-1 pt-1">
          <Label
            htmlFor="register-agree-terms"
            className="cursor-pointer items-start gap-2 font-normal"
          >
            <Checkbox
              id="register-agree-terms"
              checked={agreeTerms}
              onCheckedChange={(checked) => {
                setAgreeTerms(checked);
                clearFieldError("agreeTerms");
              }}
              disabled={isPending}
              aria-invalid={Boolean(fieldErrors.agreeTerms)}
              aria-describedby={
                fieldErrors.agreeTerms
                  ? "register-agree-terms-error"
                  : undefined
              }
              className="mt-0.5"
            />
            <span className="text-xs leading-4.5 text-gray-600">
              Tôi đồng ý với Điều khoản sử dụng và Chính sách bảo mật của
              GreenRoots Farm.
            </span>
          </Label>
          {fieldErrors.agreeTerms ? (
            <p
              id="register-agree-terms-error"
              className="text-xs text-status-spoiled"
            >
              {fieldErrors.agreeTerms}
            </p>
          ) : null}
        </div>

        <Button
          type="submit"
          disabled={isPending}
          className={`mt-1 ${AUTH_PRIMARY_BUTTON_CLASS}`}
        >
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              <span>Đang tạo tài khoản...</span>
            </>
          ) : (
            <span>Tạo tài khoản</span>
          )}
        </Button>
      </form>

      <div className="flex flex-col items-center gap-2.5 border-t border-border-subtle pt-4">
        <p className="text-center text-[13px] text-gray-500">
          Đã có tài khoản?{" "}
          <Link
            href={loginHref}
            className="font-semibold text-brand-forest hover:underline focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:outline-none"
          >
            Đăng nhập
          </Link>
        </p>

        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded text-xs font-semibold text-gray-500 transition-colors hover:text-brand-forest focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:outline-none"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          <span>Quay lại trang chủ GreenRoots Farm</span>
        </Link>
      </div>
    </div>
  );
}

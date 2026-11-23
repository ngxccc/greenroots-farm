"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type SubmitEvent } from "react";
import { API_ERROR_CODES } from "@greenroots/shared";
import { Button, buttonVariants, cn } from "@greenroots/ui";
import { CheckCircle2, KeyRound, Loader2, ShieldAlert } from "lucide-react";
import { resetPasswordAction } from "@/lib/auth/auth-actions";
import { resetPasswordFormSchema } from "@/lib/auth/auth-validation";
import { broadcastAuthEvent, useAuthStore } from "@/stores/auth.store";
import { AuthAlertBanner } from "./auth-alert-banner";
import { AuthFooterLinks } from "./auth-footer-links";
import { AUTH_PRIMARY_BUTTON_CLASS } from "./auth-styles";
import { PasswordChecklist } from "./password-checklist";
import { PasswordField } from "./password-field";

interface ResetPasswordFormProps {
  readonly token: string | null;
}

type ResetFieldKey = "password" | "confirmPassword";

/**
 * Customer password reset form enforcing full OWASP complexity rules (`zPassword()`),
 * rejecting invalid/missing tokens upfront, and synchronizing global session revocation.
 */
export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const router = useRouter();
  const clearSession = useAuthStore((state) => state.clearSession);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<ResetFieldKey, string>>
  >({});
  const [errorState, setErrorState] = useState<{
    readonly code: string;
    readonly message: string;
  } | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Render success state before checking `!token` because `history.replaceState` + `router.refresh()`
  // clears `?token=` from `searchParams` while this component remains mounted.
  if (successMessage) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-green-50 text-brand-forest">
            <CheckCircle2 className="size-8" aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="text-[22px] leading-7.5 font-bold tracking-tight text-gray-900 md:text-[28px] md:leading-9">
              Đặt lại mật khẩu thành công
            </h1>
            <p className="text-[13px] leading-5 text-balance text-gray-500">
              Vì lý do bảo mật, mọi phiên đăng nhập cũ của bạn đã kết thúc.
            </p>
          </div>
        </div>

        <AuthAlertBanner variant="success" message={successMessage} />

        <Link
          href="/login"
          className={cn(
            buttonVariants({ size: "lg" }),
            AUTH_PRIMARY_BUTTON_CLASS,
          )}
        >
          Đăng nhập với mật khẩu mới
        </Link>

        <AuthFooterLinks />
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-start gap-3.5">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-red-50 text-status-spoiled">
            <ShieldAlert className="size-6" aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="text-[22px] leading-7.5 font-bold tracking-tight text-gray-900 md:text-[28px] md:leading-9">
              Liên kết không hợp lệ
            </h1>
            <p className="text-[13px] leading-5 text-balance text-gray-500">
              Liên kết đặt lại mật khẩu bị thiếu hoặc đã quá giới hạn định dạng
              cho phép.
            </p>
          </div>
        </div>

        <AuthAlertBanner
          variant="error"
          message="Vui lòng yêu cầu một liên kết khôi phục mật khẩu mới qua email đã đăng ký."
        />

        <Link
          href="/forgot-password"
          className={cn(
            buttonVariants({ size: "lg" }),
            AUTH_PRIMARY_BUTTON_CLASS,
          )}
        >
          Yêu cầu liên kết mới
        </Link>

        <AuthFooterLinks />
      </div>
    );
  }

  function clearFieldError(field: ResetFieldKey) {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    }
    if (errorState) {
      setErrorState(null);
    }
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending || !token) {
      return;
    }

    setErrorState(null);
    setFieldErrors({});

    const parsed = resetPasswordFormSchema.safeParse({
      token,
      password,
      confirmPassword,
    });

    if (!parsed.success) {
      const nextErrors: Partial<Record<ResetFieldKey, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "password" || key === "confirmPassword") {
          nextErrors[key] ??= issue.message;
        }
      }
      setFieldErrors(nextErrors);
      if (Object.keys(nextErrors).length === 0) {
        setErrorState({
          code: API_ERROR_CODES.AUTH_RESET_TOKEN_INVALID,
          message:
            parsed.error.issues[0]?.message ??
            "Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.",
        });
      }
      return;
    }

    setIsPending(true);
    try {
      const result = await resetPasswordAction(parsed.data);
      if (result.ok) {
        clearSession();
        broadcastAuthEvent("LOGOUT");
        router.refresh();
        if (typeof window !== "undefined") {
          window.history.replaceState(null, "", "/reset-password");
        }
        setSuccessMessage(result.message);
        return;
      }

      setErrorState({ code: result.code, message: result.message });
    } catch {
      setErrorState({
        code: API_ERROR_CODES.NETWORK_ERROR,
        message: "Không thể kết nối tới máy chủ GreenRoots Farm.",
      });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3.5">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-green-50 text-brand-forest">
          <KeyRound className="size-6" aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-1">
          <h1 className="text-[22px] leading-7.5 font-bold tracking-tight text-gray-900 md:text-[28px] md:leading-9">
            Đặt lại mật khẩu
          </h1>
          <p className="text-[13px] leading-5 text-balance text-gray-500">
            Tạo mật khẩu mới để bảo vệ tài khoản GreenRoots Farm của bạn.
          </p>
        </div>
      </div>

      {errorState ? (
        <div className="flex flex-col gap-2">
          <AuthAlertBanner variant="error" message={errorState.message} />
          {errorState.code === API_ERROR_CODES.AUTH_RESET_TOKEN_INVALID ? (
            <Link
              href="/forgot-password"
              className="self-start text-xs font-semibold text-brand-forest hover:underline focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:outline-none"
            >
              Yêu cầu liên kết đặt lại mật khẩu mới →
            </Link>
          ) : null}
        </div>
      ) : null}

      <form
        noValidate
        onSubmit={(event) => void handleSubmit(event)}
        className="flex flex-col gap-3.5"
      >
        <PasswordField
          id="reset-new-password"
          label="Mật khẩu mới"
          value={password}
          onChange={(value) => {
            setPassword(value);
            clearFieldError("password");
          }}
          placeholder="Tối thiểu 8 ký tự"
          autoComplete="new-password"
          disabled={isPending}
          showLabel="Hiện mật khẩu mới"
          hideLabel="Ẩn mật khẩu mới"
          invalid={Boolean(fieldErrors.password)}
          errorMessage={fieldErrors.password}
        />

        <PasswordChecklist password={password} />

        <PasswordField
          id="reset-confirm-password"
          label="Xác nhận mật khẩu mới"
          value={confirmPassword}
          onChange={(value) => {
            setConfirmPassword(value);
            clearFieldError("confirmPassword");
          }}
          placeholder="Nhập lại mật khẩu mới"
          autoComplete="new-password"
          disabled={isPending}
          showLabel="Hiện xác nhận mật khẩu mới"
          hideLabel="Ẩn xác nhận mật khẩu mới"
          invalid={Boolean(fieldErrors.confirmPassword)}
          errorMessage={fieldErrors.confirmPassword}
        />

        <Button
          type="submit"
          disabled={isPending}
          className={`mt-1 ${AUTH_PRIMARY_BUTTON_CLASS}`}
        >
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              <span>Đang cập nhật mật khẩu...</span>
            </>
          ) : (
            <span>Cập nhật mật khẩu</span>
          )}
        </Button>
      </form>

      <AuthFooterLinks />
    </div>
  );
}

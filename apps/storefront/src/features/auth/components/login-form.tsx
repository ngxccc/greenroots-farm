"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type SubmitEvent } from "react";
import { Button, Input, Label } from "@greenroots/ui";
import { ArrowLeft, Loader2 } from "lucide-react";
import { loginAction } from "@/lib/auth/auth-actions";
import { loginFormSchema } from "@/lib/auth/auth-validation";
import { sanitizeRedirectPath } from "@/lib/auth/cookies";
import { broadcastAuthEvent, useAuthStore } from "@/stores/auth.store";
import { AuthAlertBanner } from "./auth-alert-banner";
import {
  AUTH_INPUT_CLASS,
  AUTH_LABEL_CLASS,
  AUTH_PRIMARY_BUTTON_CLASS,
} from "./auth-styles";
import { PasswordField } from "./password-field";
import { ResendVerificationControl } from "./resend-verification-control";

interface LoginFormProps {
  readonly redirectTo?: string;
  readonly loggedOutAll?: boolean;
}

/**
 * Customer credential login form wired to `loginAction` and Storefront BFF session state.
 */
export function LoginForm({
  redirectTo = "/",
  loggedOutAll = false,
}: LoginFormProps) {
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);
  const safeRedirectTo = sanitizeRedirectPath(redirectTo);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);

  const registerHref =
    safeRedirectTo !== "/"
      ? `/register?redirect=${encodeURIComponent(safeRedirectTo)}`
      : "/register";

  function handleEmailChange(event: ChangeEvent<HTMLInputElement>) {
    setEmail(event.target.value);
    if (errorMessage) setErrorMessage(null);
    if (unverifiedEmail) setUnverifiedEmail(null);
  }

  function handlePasswordChange(value: string) {
    setPassword(value);
    if (errorMessage) setErrorMessage(null);
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) {
      return;
    }

    setErrorMessage(null);
    setUnverifiedEmail(null);

    const parsed = loginFormSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrorMessage(
        parsed.error.issues[0]?.message ??
          "Vui lòng kiểm tra lại email và mật khẩu.",
      );
      return;
    }

    setIsPending(true);
    try {
      const result = await loginAction(parsed.data);
      if (result.ok) {
        if (result.user) {
          setUser(result.user);
        }
        broadcastAuthEvent("SESSION_CHANGED");
        router.push(safeRedirectTo);
        router.refresh();
        return;
      }

      setErrorMessage(result.message);
      if (result.unverifiedEmail) {
        setUnverifiedEmail(result.unverifiedEmail);
      }
    } catch {
      setErrorMessage("Không thể kết nối tới máy chủ GreenRoots Farm.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px] leading-7.5 font-bold tracking-tight text-gray-900 md:text-[28px] md:leading-9">
          Đăng nhập tài khoản
        </h1>
        <p className="text-[13px] leading-4.5 text-pretty text-gray-500">
          Chào mừng bạn trở lại. Đăng nhập để đặt rau nhanh và theo dõi đơn
          hàng.
        </p>
      </div>

      {loggedOutAll && !errorMessage ? (
        <AuthAlertBanner
          variant="success"
          message="Đã đăng xuất khỏi tất cả thiết bị. Vui lòng đăng nhập lại để tiếp tục."
        />
      ) : null}

      {errorMessage ? (
        <div className="flex flex-col gap-2.5">
          <AuthAlertBanner variant="error" message={errorMessage} />
          {unverifiedEmail ? (
            <ResendVerificationControl
              email={unverifiedEmail}
              variant="outline"
            />
          ) : null}
        </div>
      ) : null}

      <form
        noValidate
        onSubmit={(e) => void handleSubmit(e)}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="login-email" className={AUTH_LABEL_CLASS}>
            Email
          </Label>
          <Input
            id="login-email"
            type="email"
            value={email}
            onChange={handleEmailChange}
            placeholder="ten@email.com"
            autoComplete="email"
            disabled={isPending}
            required
            className={AUTH_INPUT_CLASS}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <PasswordField
            id="login-password"
            label="Mật khẩu"
            value={password}
            onChange={handlePasswordChange}
            placeholder="Nhập mật khẩu của bạn"
            autoComplete="current-password"
            disabled={isPending}
          />
          <div className="flex justify-end pt-0.5">
            <Link
              href="/forgot-password"
              className="rounded text-xs font-semibold text-brand-forest hover:underline focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:outline-none"
            >
              Quên mật khẩu?
            </Link>
          </div>
        </div>

        <Button
          type="submit"
          disabled={isPending}
          className={`mt-1 ${AUTH_PRIMARY_BUTTON_CLASS}`}
        >
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              <span>Đang đăng nhập...</span>
            </>
          ) : (
            <span>Đăng nhập</span>
          )}
        </Button>
      </form>

      <div className="flex flex-col items-center gap-2.5 border-t border-border-subtle pt-4">
        <p className="text-center text-[13px] text-gray-500">
          Chưa có tài khoản?{" "}
          <Link
            href={registerHref}
            className="font-semibold text-brand-forest hover:underline focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:outline-none"
          >
            Đăng ký ngay
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

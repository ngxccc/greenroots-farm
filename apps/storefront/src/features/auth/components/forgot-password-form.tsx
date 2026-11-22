"use client";

import { useState, type ChangeEvent, type SubmitEvent } from "react";
import { Button, Input, Label } from "@greenroots/ui";
import { KeyRound, Loader2, Send } from "lucide-react";
import { forgotPasswordAction } from "@/lib/auth/auth-actions";
import {
  FORGOT_PASSWORD_COOLDOWN_SECONDS,
  forgotPasswordFormSchema,
  formatForgotPasswordCooldownLabel,
} from "@/lib/auth/auth-validation";
import { AuthAlertBanner } from "./auth-alert-banner";
import { AuthFooterLinks } from "./auth-footer-links";
import {
  AUTH_INPUT_CLASS,
  AUTH_LABEL_CLASS,
  AUTH_PRIMARY_BUTTON_CLASS,
} from "./auth-styles";
import { useCooldown } from "./use-cooldown";

/**
 * Customer forgot-password form strictly validating email input (`ForgotPasswordDto`),
 * rendering fixed 15-minute anti-enumeration confirmation banners and 60s request cooldown.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [feedback, setFeedback] = useState<{
    readonly variant: "error" | "success";
    readonly message: string;
  } | null>(null);
  const { remainingSeconds: cooldown, startCooldown } = useCooldown(0);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending || cooldown > 0) {
      return;
    }

    setEmailError(null);
    setFeedback(null);

    const parsed = forgotPasswordFormSchema.safeParse({ email });
    if (!parsed.success) {
      setEmailError(
        parsed.error.issues[0]?.message ??
          "Địa chỉ email không đúng định dạng.",
      );
      return;
    }

    setIsPending(true);
    try {
      const result = await forgotPasswordAction(parsed.data);
      if (result.ok) {
        setHasSubmitted(true);
        setFeedback({ variant: "success", message: result.message });
        startCooldown(FORGOT_PASSWORD_COOLDOWN_SECONDS);
      } else {
        setFeedback({ variant: "error", message: result.message });
      }
    } catch {
      setFeedback({
        variant: "error",
        message: "Không thể kết nối tới máy chủ GreenRoots Farm.",
      });
    } finally {
      setIsPending(false);
    }
  }

  const idleButtonLabel = hasSubmitted
    ? formatForgotPasswordCooldownLabel(0)
    : "Gửi liên kết khôi phục";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3.5">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-green-50 text-brand-forest">
          <KeyRound className="size-6" aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-1">
          <h1 className="text-[22px] leading-7.5 font-bold tracking-tight text-gray-900 md:text-[28px] md:leading-9">
            Quên mật khẩu
          </h1>
          <p className="text-[13px] leading-5 text-balance text-gray-500">
            Nhập địa chỉ email đã đăng ký để nhận liên kết đặt lại mật khẩu
            (hiệu lực 15 phút).
          </p>
        </div>
      </div>

      {feedback ? (
        <AuthAlertBanner
          variant={feedback.variant}
          message={feedback.message}
        />
      ) : null}

      <form
        noValidate
        onSubmit={(event) => void handleSubmit(event)}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="forgot-email" className={AUTH_LABEL_CLASS}>
            Email đã đăng ký
          </Label>
          <Input
            id="forgot-email"
            type="email"
            value={email}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              setEmail(event.target.value);
              if (emailError) setEmailError(null);
              if (feedback) setFeedback(null);
            }}
            placeholder="minhanh@email.com"
            autoComplete="email"
            disabled={isPending}
            aria-invalid={Boolean(emailError)}
            aria-describedby={emailError ? "forgot-email-error" : undefined}
            className={AUTH_INPUT_CLASS}
          />
          {emailError ? (
            <p id="forgot-email-error" className="text-xs text-status-spoiled">
              {emailError}
            </p>
          ) : null}
        </div>

        <Button
          type="submit"
          disabled={isPending || cooldown > 0}
          className={`${AUTH_PRIMARY_BUTTON_CLASS} tabular-nums`}
        >
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              <span>Đang gửi yêu cầu...</span>
            </>
          ) : (
            <>
              <Send className="size-4" aria-hidden="true" />
              <span>
                {cooldown > 0
                  ? formatForgotPasswordCooldownLabel(cooldown)
                  : idleButtonLabel}
              </span>
            </>
          )}
        </Button>
      </form>

      <AuthFooterLinks />
    </div>
  );
}

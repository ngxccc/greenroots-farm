"use client";

import { useEffect, useState } from "react";
import { Button } from "@greenroots/ui";
import { Loader2, Send } from "lucide-react";
import { resendVerificationAction } from "@/lib/auth/auth-actions";
import {
  RESEND_VERIFICATION_COOLDOWN_SECONDS,
  decrementCooldownSeconds,
  formatResendCooldownLabel,
} from "@/lib/auth/auth-validation";
import { AuthAlertBanner } from "./auth-alert-banner";
import { AUTH_PRIMARY_BUTTON_CLASS } from "./auth-styles";

interface ResendVerificationControlProps {
  readonly email: string;
  readonly variant?: "default" | "outline";
  readonly initialCooldownSeconds?: number;
}

/**
 * Triggers `resendVerificationAction` with a client-side 60-second cooldown
 * matching `RESEND_VERIFICATION_COOLDOWN_SECONDS`.
 */
export function ResendVerificationControl({
  email,
  variant = "default",
  initialCooldownSeconds = 0,
}: ResendVerificationControlProps) {
  const [cooldown, setCooldown] = useState(initialCooldownSeconds);
  const [isPending, setIsPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    readonly variant: "error" | "success";
    readonly message: string;
  } | null>(null);

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setCooldown((prev) => decrementCooldownSeconds(prev));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function handleResend() {
    if (isPending || cooldown > 0) {
      return;
    }

    setIsPending(true);
    setFeedback(null);

    try {
      const result = await resendVerificationAction({ email });
      if (result.ok) {
        setFeedback({ variant: "success", message: result.message });
        setCooldown(RESEND_VERIFICATION_COOLDOWN_SECONDS);
      } else {
        setFeedback({ variant: "error", message: result.message });
      }
    } catch {
      setFeedback({
        variant: "error",
        message: "Không thể kết nối máy chủ để gửi lại email xác thực.",
      });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <Button
        type="button"
        variant={variant}
        disabled={isPending || cooldown > 0}
        onClick={() => void handleResend()}
        className={
          variant === "default"
            ? `${AUTH_PRIMARY_BUTTON_CLASS} tabular-nums`
            : "h-10 w-full cursor-pointer rounded-lg border-border-subtle bg-white text-xs font-semibold text-brand-forest tabular-nums hover:bg-green-50"
        }
      >
        {isPending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Send className="size-4" aria-hidden="true" />
        )}
        <span>{formatResendCooldownLabel(cooldown)}</span>
      </Button>

      {feedback ? (
        <AuthAlertBanner
          variant={feedback.variant}
          message={feedback.message}
        />
      ) : null}
    </div>
  );
}

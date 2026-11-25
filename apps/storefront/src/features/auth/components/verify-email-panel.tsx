"use client";

import Link from "next/link";
import { useEffect, useState, type ChangeEvent, type SubmitEvent } from "react";
import { Button, Input, Label, buttonVariants, cn } from "@greenroots/ui";
import {
  AlertTriangle,
  Loader2,
  MailCheck,
  MailQuestion,
  Send,
} from "lucide-react";
import {
  type VerifyEmailActionResult,
  resendVerificationAction,
  verifyEmailAction,
} from "@/features/auth/actions/auth-actions";
import {
  RESEND_VERIFICATION_COOLDOWN_SECONDS,
  formatResendCooldownLabel,
  resendVerificationFormSchema,
} from "@/features/auth/schemas/auth-validation";
import { AuthAlertBanner } from "./auth-alert-banner";
import { AuthFooterLinks } from "./auth-footer-links";
import {
  AUTH_INPUT_CLASS,
  AUTH_LABEL_CLASS,
  AUTH_PRIMARY_BUTTON_CLASS,
} from "./auth-styles";
import { useCooldown } from "./use-cooldown";

const verificationFlightMap = new Map<
  string,
  Promise<VerifyEmailActionResult>
>();

/**
 * Deduplicates verification token consumption in memory across concurrent callers
 * and React 19 StrictMode double-mounts so a single-use token is never posted twice.
 *
 * @param token Validated verification token string (`1..64` characters).
 * @param verifyFn Verification executor (`verifyEmailAction` in production).
 * @param flightCache Optional isolated cache map for unit testing.
 * @returns Shared verification action result promise for the given token.
 */
export function verifyEmailOnce(
  token: string,
  verifyFn: (input: {
    readonly token: string;
  }) => Promise<VerifyEmailActionResult>,
  flightCache: Map<
    string,
    Promise<VerifyEmailActionResult>
  > = verificationFlightMap,
): Promise<VerifyEmailActionResult> {
  const existing = flightCache.get(token);
  if (existing) {
    return existing;
  }

  const request = Promise.resolve()
    .then(() => verifyFn({ token }))
    .catch((error: unknown) => {
      // Evict rejected transport failures so retries in the same session are not poisoned.
      flightCache.delete(token);
      throw error;
    });
  flightCache.set(token, request);
  return request;
}

interface VerifyEmailPanelProps {
  readonly token: string | null;
  readonly hasTokenParam: boolean;
  readonly prefillEmail?: string;
}

type VerifyViewState =
  | { readonly kind: "verifying" }
  | { readonly kind: "verified"; readonly message: string }
  | { readonly kind: "invalid"; readonly message: string }
  | { readonly kind: "standalone" };

function resolveInitialVerifyState(
  token: string | null,
  hasTokenParam: boolean,
): VerifyViewState {
  if (token) {
    return { kind: "verifying" };
  }
  if (hasTokenParam) {
    return {
      kind: "invalid",
      message: "Liên kết xác thực email không hợp lệ hoặc đã hết hạn.",
    };
  }
  return { kind: "standalone" };
}

/**
 * Handles `/verify-email` single-use `?token=` activation and standalone verification email resend
 * with neutral anti-enumeration messaging and a 60-second client cooldown.
 */
export function VerifyEmailPanel({
  token,
  hasTokenParam,
  prefillEmail = "",
}: VerifyEmailPanelProps) {
  const [viewState, setViewState] = useState<VerifyViewState>(() =>
    resolveInitialVerifyState(token, hasTokenParam),
  );
  const [email, setEmail] = useState(prefillEmail);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [resendPending, setResendPending] = useState(false);
  const [resendFeedback, setResendFeedback] = useState<{
    readonly variant: "error" | "success";
    readonly message: string;
  } | null>(null);
  const { remainingSeconds: cooldown, startCooldown } = useCooldown(0);

  useEffect(() => {
    if (!token) {
      if (hasTokenParam && typeof window !== "undefined") {
        window.history.replaceState(null, "", "/verify-email");
      }
      return;
    }

    let cancelled = false;

    void verifyEmailOnce(token, verifyEmailAction)
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (typeof window !== "undefined") {
          window.history.replaceState(null, "", "/verify-email");
        }
        if (result.ok) {
          setViewState({ kind: "verified", message: result.message });
        } else {
          setViewState({ kind: "invalid", message: result.message });
        }
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        if (typeof window !== "undefined") {
          window.history.replaceState(null, "", "/verify-email");
        }
        setViewState({
          kind: "invalid",
          message: "Không thể kết nối tới máy chủ để xác thực email.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [hasTokenParam, token]);

  async function handleResendSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (resendPending || cooldown > 0) {
      return;
    }

    setEmailError(null);
    setResendFeedback(null);

    const parsed = resendVerificationFormSchema.safeParse({ email });
    if (!parsed.success) {
      setEmailError(
        parsed.error.issues[0]?.message ??
          "Địa chỉ email không đúng định dạng.",
      );
      return;
    }

    setResendPending(true);
    try {
      const result = await resendVerificationAction(parsed.data);
      if (result.ok) {
        setResendFeedback({ variant: "success", message: result.message });
        startCooldown(RESEND_VERIFICATION_COOLDOWN_SECONDS);
      } else {
        setResendFeedback({ variant: "error", message: result.message });
      }
    } catch {
      setResendFeedback({
        variant: "error",
        message: "Không thể kết nối tới máy chủ để gửi lại email xác thực.",
      });
    } finally {
      setResendPending(false);
    }
  }

  if (viewState.kind === "verifying") {
    return (
      <div className="flex flex-col items-center gap-5 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-green-50 text-brand-forest">
          <Loader2 className="size-8 animate-spin" aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[22px] leading-7.5 font-bold tracking-tight text-gray-900 md:text-[28px] md:leading-9">
            Đang xác thực email...
          </h1>
          <p className="text-[13px] leading-5 text-balance text-gray-500">
            Hệ thống đang kiểm tra liên kết kích hoạt tài khoản GreenRoots Farm
            của bạn.
          </p>
        </div>
      </div>
    );
  }

  if (viewState.kind === "verified") {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-green-50 text-brand-forest">
            <MailCheck className="size-8" aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="text-[22px] leading-7.5 font-bold tracking-tight text-gray-900 md:text-[28px] md:leading-9">
              Xác thực email thành công
            </h1>
            <p className="text-[13px] leading-5 text-balance text-gray-500">
              Tài khoản của bạn đã được kích hoạt và sẵn sàng đặt hàng.
            </p>
          </div>
        </div>

        <AuthAlertBanner variant="success" message={viewState.message} />

        <Link
          href="/login"
          className={cn(
            buttonVariants({ size: "lg" }),
            AUTH_PRIMARY_BUTTON_CLASS,
          )}
        >
          Đăng nhập ngay
        </Link>

        <AuthFooterLinks />
      </div>
    );
  }

  const isInvalidToken = viewState.kind === "invalid";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3.5">
        <span
          className={`flex size-12 shrink-0 items-center justify-center rounded-full ${
            isInvalidToken
              ? "bg-red-50 text-status-spoiled"
              : "bg-green-50 text-brand-forest"
          }`}
        >
          {isInvalidToken ? (
            <AlertTriangle className="size-6" aria-hidden="true" />
          ) : (
            <MailQuestion className="size-6" aria-hidden="true" />
          )}
        </span>
        <div className="flex flex-col gap-1">
          <h1 className="text-[22px] leading-7.5 font-bold tracking-tight text-gray-900 md:text-[28px] md:leading-9">
            {isInvalidToken
              ? "Liên kết xác thực hết hạn"
              : "Xác thực địa chỉ email"}
          </h1>
          <p className="text-[13px] leading-5 text-balance text-gray-500">
            {isInvalidToken
              ? "Liên kết kích hoạt không hợp lệ hoặc đã được sử dụng. Nhập email để nhận liên kết mới, hoặc đăng nhập nếu bạn đã kích hoạt trước đó."
              : "Nhập địa chỉ email đã đăng ký để nhận liên kết kích hoạt tài khoản (hiệu lực 24 giờ)."}
          </p>
        </div>
      </div>

      {isInvalidToken ? (
        <AuthAlertBanner variant="error" message={viewState.message} />
      ) : (
        <div className="flex flex-col gap-1 rounded-lg border border-border-subtle bg-surface-warm p-3.5 text-left">
          <span className="text-xs font-semibold text-gray-900">
            Chưa thấy email xác thực?
          </span>
          <p className="text-xs leading-4.5 text-pretty text-gray-600">
            Kiểm tra thư mục Quảng cáo hoặc Spam, hoặc nhập email bên dưới để
            gửi lại liên kết mới.
          </p>
        </div>
      )}

      <form
        noValidate
        onSubmit={(event) => void handleResendSubmit(event)}
        className="flex flex-col gap-3.5"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="verify-resend-email" className={AUTH_LABEL_CLASS}>
            Email đã đăng ký
          </Label>
          <Input
            id="verify-resend-email"
            type="email"
            value={email}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              setEmail(event.target.value);
              if (emailError) setEmailError(null);
              if (resendFeedback) setResendFeedback(null);
            }}
            placeholder="minhanh@email.com"
            autoComplete="email"
            disabled={resendPending}
            aria-invalid={Boolean(emailError)}
            aria-describedby={
              emailError ? "verify-resend-email-error" : undefined
            }
            className={AUTH_INPUT_CLASS}
          />
          {emailError ? (
            <p
              id="verify-resend-email-error"
              className="text-xs text-status-spoiled"
            >
              {emailError}
            </p>
          ) : null}
        </div>

        <Button
          type="submit"
          disabled={resendPending || cooldown > 0}
          className={`${AUTH_PRIMARY_BUTTON_CLASS} tabular-nums`}
        >
          {resendPending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              <span>Đang gửi yêu cầu...</span>
            </>
          ) : (
            <>
              <Send className="size-4" aria-hidden="true" />
              <span>{formatResendCooldownLabel(cooldown)}</span>
            </>
          )}
        </Button>
      </form>

      {resendFeedback ? (
        <AuthAlertBanner
          variant={resendFeedback.variant}
          message={resendFeedback.message}
        />
      ) : null}

      <div className="flex flex-col items-center gap-2.5">
        <p className="text-center text-xs text-gray-500">
          Lỡ nhập sai email lúc đăng ký?{" "}
          <Link
            href="/register"
            className="font-semibold text-brand-forest hover:underline focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:outline-none"
          >
            Đăng ký bằng email khác
          </Link>
        </p>

        <AuthFooterLinks />
      </div>
    </div>
  );
}

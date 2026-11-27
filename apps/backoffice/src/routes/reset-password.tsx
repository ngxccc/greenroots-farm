import { Alert, AlertDescription, Button } from "@greenroots/ui";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { useState, type SubmitEvent } from "react";
import {
  AuthCardShell,
  AuthErrorAlert,
  PasswordField,
} from "@/features/auth/components/auth-card-shell";
import { api, extractApiErrorMessage } from "@/lib/api-client";

interface ResetPasswordSearch {
  readonly token?: string;
}

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>): ResetPasswordSearch => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (!token) {
      setErrorMessage("Liên kết đặt lại mật khẩu thiếu hoặc không hợp lệ.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Mật khẩu xác nhận không khớp.");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await api.POST("/api/v1/auth/reset-password", {
        body: { token, password, confirmPassword },
      });

      if (error) {
        setErrorMessage(
          extractApiErrorMessage(
            error,
            "Không thể đặt lại mật khẩu. Liên kết có thể đã hết hạn.",
          ),
        );
        return;
      }

      setCompleted(true);
    } catch {
      setErrorMessage("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCardShell
      title="Đặt lại mật khẩu"
      description="Tạo mật khẩu mới cho tài khoản vận hành nội bộ của bạn."
    >
      <div className="flex flex-col gap-4">
        <AuthErrorAlert
          message={
            token
              ? null
              : "Liên kết đặt lại mật khẩu không hợp lệ hoặc thiếu mã xác thực."
          }
        />
        <AuthErrorAlert message={errorMessage} />

        {completed ? (
          <div className="flex flex-col gap-4">
            <Alert
              role="status"
              className="border-brand-forest/30 bg-green-50 text-gray-800"
            >
              <CheckCircle2
                className="size-4 text-brand-forest"
                aria-hidden="true"
              />
              <AlertDescription className="text-xs">
                Mật khẩu đã được cập nhật. Mọi phiên đăng nhập cũ đã bị thu hồi.
              </AlertDescription>
            </Alert>
            <Button
              type="button"
              onClick={() => void navigate({ to: "/login" })}
              className="h-11 w-full bg-brand-forest font-bold text-white hover:bg-brand-dark"
            >
              Đăng nhập ngay
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <PasswordField
              id="reset-password"
              label="Mật khẩu mới"
              placeholder="Ít nhất 8 ký tự"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <PasswordField
              id="reset-confirm-password"
              label="Xác nhận mật khẩu mới"
              placeholder="Nhập lại mật khẩu mới"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />

            <Button
              type="submit"
              disabled={submitting || !token}
              className="h-11 w-full bg-brand-forest font-bold text-white hover:bg-brand-dark"
            >
              {submitting ? "Đang cập nhật..." : "Đặt lại mật khẩu"}
            </Button>
          </form>
        )}

        <div className="text-center">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-brand-forest"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            <span>Quay lại đăng nhập</span>
          </Link>
        </div>
      </div>
    </AuthCardShell>
  );
}

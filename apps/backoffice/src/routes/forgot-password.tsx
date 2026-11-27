import { Alert, AlertDescription, Button, Input, Label } from "@greenroots/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { useState, type SubmitEvent } from "react";
import {
  AuthCardShell,
  AuthErrorAlert,
} from "@/features/auth/components/auth-card-shell";
import { api, extractApiErrorMessage } from "@/lib/api-client";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);

    try {
      const { error } = await api.POST("/api/v1/auth/forgot-password", {
        body: { email: email.trim() },
      });

      if (error) {
        setErrorMessage(
          extractApiErrorMessage(
            error,
            "Không thể gửi yêu cầu đặt lại mật khẩu. Vui lòng thử lại.",
          ),
        );
        return;
      }

      setSubmitted(true);
    } catch {
      setErrorMessage("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCardShell
      title="Quên mật khẩu"
      description="Nhập email nội bộ để nhận liên kết đặt lại mật khẩu (hiệu lực 15 phút)."
    >
      <div className="flex flex-col gap-4">
        <AuthErrorAlert message={errorMessage} />

        {submitted ? (
          <Alert
            role="status"
            className="border-brand-forest/30 bg-green-50 text-gray-800"
          >
            <CheckCircle2
              className="size-4 text-brand-forest"
              aria-hidden="true"
            />
            <AlertDescription className="text-xs">
              Nếu email tồn tại và đang hoạt động trong hệ thống, liên kết đặt
              lại mật khẩu đã được gửi tới hộp thư của bạn.
            </AlertDescription>
          </Alert>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="forgot-email"
                className="text-xs font-semibold text-gray-700"
              >
                Email nội bộ
              </Label>
              <Input
                id="forgot-email"
                type="email"
                placeholder="staff@greenroots.vn"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 bg-surface-warm text-sm focus-visible:border-brand-forest"
              />
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="h-11 w-full bg-brand-forest font-bold text-white hover:bg-brand-dark"
            >
              {submitting ? "Đang gửi..." : "Gửi liên kết đặt lại mật khẩu"}
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

import { Button, Input, Label } from "@greenroots/ui";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type SubmitEvent } from "react";
import {
  AuthCardShell,
  AuthErrorAlert,
  PasswordField,
} from "@/features/auth/components/auth-card-shell";
import {
  getDefaultRouteForRole,
  useAuthStore,
} from "@/features/auth/stores/auth.store";
import { api, extractApiErrorMessage } from "@/lib/api-client";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const setSession = useAuthStore((state) => state.setSession);
  const navigate = useNavigate();

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);

    try {
      const { data, error } = await api.POST("/api/v1/auth/staff/login", {
        body: { email: email.trim(), password },
      });

      if (error) {
        setErrorMessage(
          extractApiErrorMessage(
            error,
            "Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.",
          ),
        );
        return;
      }

      const { accessToken, user } = data.data;
      setSession(accessToken, user);
      void navigate({ to: getDefaultRouteForRole(user.role) });
    } catch {
      setErrorMessage("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCardShell
      title="Đăng nhập nội bộ"
      description="Farm Staff, Sales, Admin & SuperAdmin"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <AuthErrorAlert message={errorMessage} />

        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor="login-email"
            className="text-xs font-semibold text-gray-700"
          >
            Email nội bộ
          </Label>
          <Input
            id="login-email"
            type="email"
            placeholder="staff@greenroots.vn"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 bg-surface-warm text-sm focus-visible:border-brand-forest"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <PasswordField
            id="login-password"
            label="Mật khẩu"
            placeholder="Nhập mật khẩu của bạn"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="flex justify-end pt-0.5">
            <Link
              to="/forgot-password"
              className="text-xs font-semibold text-brand-forest hover:underline focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:outline-none"
            >
              Quên mật khẩu?
            </Link>
          </div>
        </div>

        <Button
          type="submit"
          disabled={submitting}
          className="mt-1 h-11 w-full bg-brand-forest font-bold text-white hover:bg-brand-dark"
        >
          {submitting ? "Đang đăng nhập..." : "Đăng nhập"}
        </Button>
      </form>
    </AuthCardShell>
  );
}

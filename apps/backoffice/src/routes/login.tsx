import type { UserRole } from "@greenroots/shared";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  toast,
} from "@greenroots/ui";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Leaf } from "lucide-react";
import { useState, type SubmitEvent } from "react";
import { getDefaultRouteForRole, useAuthStore } from "@/stores/auth.store";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const loginDemoRole = useAuthStore((state) => state.loginDemoRole);
  const navigate = useNavigate();

  function handleQuickLogin(role: UserRole) {
    loginDemoRole(role);
    toast.success(`Đã đăng nhập vai trò ${role}`);
    void navigate({ to: getDefaultRouteForRole(role) });
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    toast.info(
      "API /auth/login sẽ nối ở bước tiếp theo; dùng nút Demo bên dưới.",
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-warm p-4">
      <Card className="w-full max-w-md border-border-subtle bg-white shadow-sm">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-brand-forest text-white">
            <Leaf className="size-6" />
          </div>
          <CardTitle className="text-xl font-extrabold text-gray-900">
            GreenRoots Backoffice
          </CardTitle>
          <CardDescription>
            Cổng vận hành nội bộ — Farm Staff, Sales, Admin &amp; SuperAdmin
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input
              type="email"
              placeholder="Email nội bộ (@greenroots.vn)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11"
            />
            <Input
              type="password"
              placeholder="Mật khẩu"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11"
            />
            <Button
              type="submit"
              className="h-11 w-full bg-brand-forest font-bold text-white hover:bg-brand-dark"
            >
              Đăng nhập
            </Button>
          </form>

          <div className="space-y-2 border-t border-border-subtle pt-4">
            <p className="text-center text-xs font-semibold text-gray-500">
              Đăng nhập nhanh theo vai trò (Demo)
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleQuickLogin("farm_staff")}
                className="min-h-12 text-xs font-semibold"
              >
                Farm Staff (Mobile)
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleQuickLogin("sales")}
                className="min-h-12 text-xs font-semibold"
              >
                Sales (FEFO)
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleQuickLogin("admin")}
                className="min-h-12 text-xs font-semibold"
              >
                Admin (Vận hành)
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleQuickLogin("super_admin")}
                className="min-h-12 text-xs font-semibold"
              >
                SuperAdmin
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

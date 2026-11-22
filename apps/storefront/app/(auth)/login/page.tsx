import type { Metadata } from "next";
import { Suspense } from "react";
import {
  AuthFormSkeleton,
  AuthRedirectGate,
  type AuthSearchParams,
} from "@/features/auth/components/auth-redirect-gate";
import { LoginForm } from "@/features/auth/components/login-form";

export const metadata: Metadata = {
  title: "Đăng nhập — GreenRoots Farm",
  description:
    "Đăng nhập tài khoản GreenRoots Farm để đặt rau củ hữu cơ thu hoạch sáng và theo dõi đơn hàng.",
};

interface LoginPageProps {
  readonly searchParams: Promise<AuthSearchParams>;
}

/**
 * Customer login route rendering inside the `(auth)` split-panel shell.
 */
export default function LoginPage({ searchParams }: LoginPageProps) {
  return (
    <Suspense fallback={<AuthFormSkeleton />}>
      <AuthRedirectGate
        searchParams={searchParams}
        renderForm={(redirectTo) => <LoginForm redirectTo={redirectTo} />}
      />
    </Suspense>
  );
}

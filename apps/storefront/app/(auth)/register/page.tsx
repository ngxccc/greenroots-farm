import type { Metadata } from "next";
import { Suspense } from "react";
import {
  AuthFormSkeleton,
  AuthRedirectGate,
  type AuthSearchParams,
} from "@/features/auth/components/auth-redirect-gate";
import { RegisterForm } from "@/features/auth/components/register-form";

export const metadata: Metadata = {
  title: "Đăng ký tài khoản",
  description:
    "Tạo tài khoản khách hàng GreenRoots Farm để tích điểm thành viên và đặt rau củ hữu cơ giao trong ngày.",
};

interface RegisterPageProps {
  readonly searchParams: Promise<AuthSearchParams>;
}

/**
 * Customer registration route rendering inside the `(auth)` split-panel shell.
 */
export default function RegisterPage({ searchParams }: RegisterPageProps) {
  return (
    <Suspense fallback={<AuthFormSkeleton />}>
      <AuthRedirectGate
        searchParams={searchParams}
        renderForm={(redirectTo) => <RegisterForm redirectTo={redirectTo} />}
      />
    </Suspense>
  );
}

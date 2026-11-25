import type { Metadata } from "next";
import { Suspense } from "react";
import {
  AuthFormSkeleton,
  AuthRedirectGate,
  type AuthSearchParams,
} from "@/features/auth/components/auth-redirect-gate";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";

export const metadata: Metadata = {
  title: "Quên mật khẩu",
  description:
    "Yêu cầu liên kết đặt lại mật khẩu cho tài khoản khách hàng GreenRoots Farm.",
};

interface ForgotPasswordPageProps {
  readonly searchParams: Promise<AuthSearchParams>;
}

/**
 * Customer forgot-password route rendering inside the `(auth)` split-panel shell.
 */
export default function ForgotPasswordPage({
  searchParams,
}: ForgotPasswordPageProps) {
  return (
    <Suspense fallback={<AuthFormSkeleton />}>
      <AuthRedirectGate
        searchParams={searchParams}
        renderForm={() => <ForgotPasswordForm />}
      />
    </Suspense>
  );
}

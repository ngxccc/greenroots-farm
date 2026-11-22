import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFormSkeleton } from "@/features/auth/components/auth-redirect-gate";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { parseRecoveryTokenParam } from "@/lib/auth/auth-validation";

export const metadata: Metadata = {
  title: "Đặt lại mật khẩu",
  description:
    "Tạo mật khẩu mới an toàn cho tài khoản khách hàng GreenRoots Farm.",
};

interface ResetPasswordSearchParams {
  readonly token?: string | string[];
}

interface ResetPasswordPageProps {
  readonly searchParams: Promise<ResetPasswordSearchParams>;
}

async function ResetPasswordSearchGate({
  searchParams,
}: ResetPasswordPageProps) {
  const resolved = await searchParams;
  const token = parseRecoveryTokenParam(resolved.token);

  return <ResetPasswordForm token={token} />;
}

/**
 * Customer password reset route rendering inside the `(auth)` split-panel shell.
 */
export default function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  return (
    <Suspense fallback={<AuthFormSkeleton />}>
      <ResetPasswordSearchGate searchParams={searchParams} />
    </Suspense>
  );
}

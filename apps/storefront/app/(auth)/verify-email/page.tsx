import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFormSkeleton } from "@/features/auth/components/auth-redirect-gate";
import {
  VerifyEmailGate,
  type VerifyEmailSearchParams,
} from "@/features/auth/components/verify-email-gate";

export const metadata: Metadata = {
  title: "Xác thực email",
  description:
    "Xác thực địa chỉ email tài khoản GreenRoots Farm hoặc gửi lại liên kết kích hoạt mới.",
};

interface VerifyEmailPageProps {
  readonly searchParams: Promise<VerifyEmailSearchParams>;
}

/**
 * Customer email verification route rendering inside the `(auth)` split-panel shell.
 */
export default function VerifyEmailPage({
  searchParams,
}: VerifyEmailPageProps) {
  return (
    <Suspense fallback={<AuthFormSkeleton />}>
      <VerifyEmailGate searchParams={searchParams} />
    </Suspense>
  );
}

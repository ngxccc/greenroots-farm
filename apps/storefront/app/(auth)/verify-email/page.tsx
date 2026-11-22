import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFormSkeleton } from "@/features/auth/components/auth-redirect-gate";
import { VerifyEmailPanel } from "@/features/auth/components/verify-email-panel";
import {
  extractFirstQueryValue,
  parsePrefillEmailParam,
  parseRecoveryTokenParam,
} from "@/lib/auth/auth-validation";

export const metadata: Metadata = {
  title: "Xác thực email",
  description:
    "Xác thực địa chỉ email tài khoản GreenRoots Farm hoặc gửi lại liên kết kích hoạt mới.",
};

interface VerifyEmailSearchParams {
  readonly token?: string | string[];
  readonly email?: string | string[];
}

interface VerifyEmailPageProps {
  readonly searchParams: Promise<VerifyEmailSearchParams>;
}

async function VerifyEmailSearchGate({ searchParams }: VerifyEmailPageProps) {
  const resolved = await searchParams;
  const hasTokenParam = extractFirstQueryValue(resolved.token) !== undefined;
  const token = parseRecoveryTokenParam(resolved.token);
  const prefillEmail = parsePrefillEmailParam(resolved.email);

  return (
    <VerifyEmailPanel
      key={`${token ?? (hasTokenParam ? "invalid" : "standalone")}:${prefillEmail}`}
      token={token}
      hasTokenParam={hasTokenParam}
      prefillEmail={prefillEmail}
    />
  );
}

/**
 * Customer email verification route rendering inside the `(auth)` split-panel shell.
 */
export default function VerifyEmailPage({
  searchParams,
}: VerifyEmailPageProps) {
  return (
    <Suspense fallback={<AuthFormSkeleton />}>
      <VerifyEmailSearchGate searchParams={searchParams} />
    </Suspense>
  );
}

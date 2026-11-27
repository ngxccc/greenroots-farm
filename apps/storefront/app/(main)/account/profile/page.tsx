import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import {
  AccountProfileDegradedView,
  AccountProfileSkeleton,
  AccountProfileView,
} from "@/features/account/components/account-profile-view";
import { getAccountProfileWithSessions } from "@/features/auth/services/session.server";

export const metadata: Metadata = {
  title: "Hồ sơ & Bảo mật",
  description:
    "Quản lý thông tin cá nhân, kiểm tra điểm tích lũy GreenRoots và bảo mật phiên đăng nhập.",
};

async function AccountProfileGate() {
  // Force per-request dynamic execution before uncached session/API reads under cacheComponents.
  await connection();
  const resolution = await getAccountProfileWithSessions();

  if (resolution.status === "unauthenticated") {
    redirect("/login?redirect=%2Faccount%2Fprofile");
  }

  if (resolution.status === "degraded") {
    return <AccountProfileDegradedView />;
  }

  return (
    <AccountProfileView
      initialUser={resolution.user}
      initialSessionsState={resolution.sessionsState}
    />
  );
}

/**
 * Authenticated customer profile, loyalty points, and global logout route (`/account/profile`).
 */
export default function AccountProfilePage() {
  return (
    <Suspense fallback={<AccountProfileSkeleton />}>
      <AccountProfileGate />
    </Suspense>
  );
}

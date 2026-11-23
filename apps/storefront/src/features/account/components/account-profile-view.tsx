"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  Skeleton,
  buttonVariants,
} from "@greenroots/ui";
import { AlertCircle, Home, RefreshCw } from "lucide-react";
import { useAuthStore } from "@/stores/auth.store";
import type { StorefrontSessionUser } from "@/types/auth.types";
import { AccountSidebar } from "./account-sidebar";
import { LoyaltyBalanceCard } from "./loyalty-balance-card";
import { ProfileDetailsForm } from "./profile-details-form";
import { SecuritySessionsCard } from "./security-sessions-card";

interface AccountProfileViewProps {
  readonly initialUser: StorefrontSessionUser;
}

/**
 * Coordinates the 2-column customer profile, loyalty balance, and security cards
 * inside `StorefrontShell` (`app/(main)/layout.tsx`), syncing fresh SSR profile data
 * into `useAuthStore` across client navigations.
 *
 * @param props Fresh server-fetched `StorefrontSessionUser`.
 * @returns Responsive two-column account profile dashboard.
 */
export function AccountProfileView({ initialUser }: AccountProfileViewProps) {
  const setUser = useAuthStore((state) => state.setUser);
  const [editedSnapshot, setEditedSnapshot] = useState<{
    readonly base: StorefrontSessionUser;
    readonly next: StorefrontSessionUser;
  } | null>(null);

  useEffect(() => {
    setUser(initialUser);
  }, [initialUser, setUser]);

  const activeUser =
    editedSnapshot?.base === initialUser ? editedSnapshot.next : initialUser;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:py-6 lg:px-6 lg:py-8">
      <div className="grid grid-cols-1 items-start gap-4 sm:gap-6 lg:grid-cols-12">
        <AccountSidebar user={activeUser} />

        <div className="flex flex-col gap-4 sm:gap-6 lg:col-span-9">
          <LoyaltyBalanceCard rewardPoints={activeUser.rewardPoints} />
          <ProfileDetailsForm
            user={activeUser}
            onProfileUpdated={(updated) =>
              setEditedSnapshot({ base: initialUser, next: updated })
            }
          />
          <SecuritySessionsCard />
        </div>
      </div>
    </div>
  );
}

interface AccountProfileDegradedCardProps {
  readonly onRetry?: () => void;
}

/**
 * Pure presentational degraded-mode recovery card (`INV-SF-PROFILE-1`).
 *
 * @param props Optional retry callback invoked when clicking `"Thử tải lại"`.
 * @returns Accessible error alert card preserving cookies and providing retry/home actions.
 */
export function AccountProfileDegradedCard({
  onRetry,
}: AccountProfileDegradedCardProps) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 lg:px-6">
      <Card className="border-border-subtle bg-surface-card py-0 shadow-sm">
        <CardContent className="flex flex-col gap-4 p-6">
          <Alert variant="destructive">
            <AlertCircle className="size-4" aria-hidden="true" />
            <AlertTitle>Không thể tải thông tin tài khoản lúc này</AlertTitle>
            <AlertDescription>
              Kết nối tới máy chủ GreenRoots Farm đang tạm gián đoạn. Phiên đăng
              nhập của bạn vẫn được giữ nguyên — vui lòng thử tải lại sau ít
              giây.
            </AlertDescription>
          </Alert>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={onRetry}
              className="h-10 cursor-pointer gap-2 rounded-lg bg-brand-forest px-4 text-sm font-semibold text-white hover:bg-brand-dark"
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              <span>Thử tải lại</span>
            </Button>

            <Link
              href="/"
              className={buttonVariants({
                variant: "outline",
                className: "h-10 gap-2 rounded-lg text-sm font-semibold",
              })}
            >
              <Home className="size-4" aria-hidden="true" />
              <span>Về trang chủ</span>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Degraded-mode recovery card shown when upstream `/users/me` or proxy refresh hits a transient
 * failure (`x-gr-auth-degraded: 1` or `5xx`) without wiping valid 7-day cookies (`INV-SF-PROFILE-1`).
 */
export function AccountProfileDegradedView() {
  const router = useRouter();
  return <AccountProfileDegradedCard onRetry={() => router.refresh()} />;
}

/**
 * Streaming skeleton rendered inside `<Suspense>` while `/account/profile` resolves session state.
 */
export function AccountProfileSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="mx-auto w-full max-w-6xl px-4 py-6 lg:px-6 lg:py-8"
    >
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <div className="lg:col-span-3">
          <Skeleton className="h-60 w-full rounded-xl" />
        </div>
        <div className="flex flex-col gap-6 lg:col-span-9">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
          <Skeleton className="h-44 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

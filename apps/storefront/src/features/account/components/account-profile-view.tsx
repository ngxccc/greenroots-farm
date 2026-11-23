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
import { LoyaltyBalanceCard } from "./loyalty-balance-card";
import { ProfileDetailsForm } from "./profile-details-form";
import { SecuritySessionsCard } from "./security-sessions-card";

interface AccountProfileViewProps {
  readonly initialUser: StorefrontSessionUser;
}

/**
 * Coordinates the customer loyalty balance, editable profile details, and security cards
 * inside persistent `/account/layout.tsx`, syncing fresh SSR profile data into `useAuthStore`.
 *
 * @param props Fresh server-fetched `StorefrontSessionUser`.
 * @returns Profile, loyalty, and security card stack.
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
    <div className="flex flex-col gap-4 sm:gap-6">
      <LoyaltyBalanceCard rewardPoints={activeUser.rewardPoints} />
      <ProfileDetailsForm
        user={activeUser}
        onProfileUpdated={(updated) =>
          setEditedSnapshot({ base: initialUser, next: updated })
        }
      />
      <SecuritySessionsCard />
    </div>
  );
}

interface AccountProfileDegradedCardProps {
  readonly title?: string;
  readonly description?: string;
  readonly onRetry?: () => void;
}

/**
 * Pure presentational degraded-mode recovery card (`INV-SF-PROFILE-1`, `INV-SF-ADDR-4`).
 *
 * @param props Optional localized title/description copy and retry handler for `"Thử tải lại"`.
 * @returns Accessible error alert card preserving cookies and providing retry/home actions.
 */
export function AccountProfileDegradedCard({
  title = "Không thể tải thông tin tài khoản lúc này",
  description = "Kết nối tới máy chủ GreenRoots Farm đang tạm gián đoạn. Phiên đăng nhập của bạn vẫn được giữ nguyên — vui lòng thử tải lại sau ít giây.",
  onRetry,
}: AccountProfileDegradedCardProps) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 lg:px-6">
      <Card className="border-border-subtle bg-surface-card py-0 shadow-sm">
        <CardContent className="flex flex-col gap-4 p-6">
          <Alert variant="destructive">
            <AlertCircle className="size-4" aria-hidden="true" />
            <AlertTitle>{title}</AlertTitle>
            <AlertDescription>{description}</AlertDescription>
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
    <div aria-hidden="true" className="flex flex-col gap-6">
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-72 w-full rounded-xl" />
      <Skeleton className="h-44 w-full rounded-xl" />
    </div>
  );
}

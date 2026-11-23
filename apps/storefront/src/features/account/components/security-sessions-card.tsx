"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  toast,
} from "@greenroots/ui";
import { LogOut, ShieldAlert } from "lucide-react";
import { ConfirmActionDialog } from "@/components/common/confirm-action-dialog";
import { logoutAllAction } from "@/lib/auth/auth-actions";
import { invalidateStorefrontClientSession } from "@/lib/auth/client-logout";

interface SecuritySessionsViewProps {
  readonly dialogOpen: boolean;
  readonly isPending: boolean;
  readonly errorMessage: string | null;
  readonly onDialogOpenChange: (open: boolean) => void;
  readonly onConfirmLogoutAll: () => void;
}

/**
 * Pure presentational security section and global revocation confirmation dialog (`INV-SF-PROFILE-7`).
 *
 * @param props Modal visibility, pending/error state, and confirmation handlers.
 * @returns Session security card with confirmed global revocation trigger.
 */
export function SecuritySessionsView({
  dialogOpen,
  isPending,
  errorMessage,
  onDialogOpenChange,
  onConfirmLogoutAll,
}: SecuritySessionsViewProps) {
  return (
    <Card
      aria-label="Bảo mật phiên đăng nhập"
      className="border-border-subtle bg-surface-card py-0 shadow-sm"
    >
      <CardHeader className="border-b border-border-subtle px-4 py-3.5 sm:px-6 sm:py-4">
        <CardTitle className="text-base font-bold text-gray-900 sm:text-lg">
          Bảo mật phiên đăng nhập
        </CardTitle>
        <CardDescription className="text-xs text-gray-500">
          Thu hồi ngay lập tức toàn bộ phiên đăng nhập khi bạn nghi ngờ thiết bị
          khác còn lưu tài khoản.
        </CardDescription>
      </CardHeader>

      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-status-spoiled">
              <ShieldAlert className="size-5" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-gray-900">
                Thu hồi toàn bộ phiên
              </span>
              <span className="text-xs leading-relaxed text-gray-500">
                Đăng xuất ngay lập tức khỏi mọi trình duyệt và điện thoại khác,
                bao gồm cả thiết bị hiện tại.
              </span>
            </div>
          </div>

          <Button
            type="button"
            variant="destructive"
            onClick={() => onDialogOpenChange(true)}
            className="h-10 w-full shrink-0 cursor-pointer gap-2 rounded-lg px-4 text-xs font-semibold sm:w-auto"
          >
            <LogOut className="size-4" aria-hidden="true" />
            <span>Đăng xuất khỏi tất cả thiết bị</span>
          </Button>

          <ConfirmActionDialog
            open={dialogOpen}
            onOpenChange={onDialogOpenChange}
            title="Xác nhận đăng xuất khỏi tất cả thiết bị?"
            description="Toàn bộ phiên đăng nhập trên các trình duyệt và điện thoại khác sẽ bị thu hồi ngay lập tức. Thiết bị hiện tại cũng sẽ bị đăng xuất và bạn cần đăng nhập lại."
            confirmLabel="Xác nhận đăng xuất tất cả"
            pendingLabel="Đang thu hồi..."
            isPending={isPending}
            errorMessage={errorMessage}
            onConfirm={onConfirmLogoutAll}
          />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Security section providing a confirmed global session revocation dialog calling
 * `POST /api/v1/auth/logout-all` (`INV-SF-PROFILE-6`, `INV-SF-PROFILE-7`).
 */
export function SecuritySessionsCard() {
  const router = useRouter();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleDialogOpenChange(open: boolean) {
    if (isPending) {
      return;
    }
    setDialogOpen(open);
    if (!open) {
      setErrorMessage(null);
    }
  }

  async function handleConfirmLogoutAll() {
    if (isPending) {
      return;
    }

    setErrorMessage(null);
    setIsPending(true);
    try {
      const result = await logoutAllAction();
      if (result.ok) {
        invalidateStorefrontClientSession();
        setDialogOpen(false);
        toast.success(result.message);
        router.replace("/login?loggedOutAll=1");
        router.refresh();
        return;
      }

      if (result.sessionInvalidated) {
        invalidateStorefrontClientSession();
        setDialogOpen(false);
        router.replace("/login?redirect=%2Faccount%2Fprofile");
        router.refresh();
        return;
      }

      setErrorMessage(result.message);
    } catch {
      setErrorMessage("Không thể kết nối tới máy chủ GreenRoots Farm.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <SecuritySessionsView
      dialogOpen={dialogOpen}
      isPending={isPending}
      errorMessage={errorMessage}
      onDialogOpenChange={handleDialogOpenChange}
      onConfirmLogoutAll={() => void handleConfirmLogoutAll()}
    />
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
} from "@greenroots/ui";
import { AlertCircle, Info, LogOut, Monitor, Smartphone } from "lucide-react";
import { ConfirmActionDialog } from "@/components/common/confirm-action-dialog";
import {
  formatSessionDeviceLabel,
  formatSessionIpAddress,
  formatSessionTimestamp,
  isMobileSessionDevice,
} from "@/features/account/utils/session-display";
import { logoutAllAction } from "@/features/auth/actions/auth-actions";
import type { CustomerSessionsState } from "@/features/auth/services/session.server";
import type { CustomerActiveSession } from "@/features/auth/types/auth.types";
import { invalidateStorefrontClientSession } from "@/features/auth/utils/client-logout";

interface SecuritySessionsViewProps {
  readonly sessionsState: CustomerSessionsState;
  readonly dialogOpen: boolean;
  readonly isPending: boolean;
  readonly errorMessage: string | null;
  readonly onDialogOpenChange: (open: boolean) => void;
  readonly onConfirmLogoutAll: () => void;
}

interface SecuritySessionsCardProps {
  readonly sessionsState: CustomerSessionsState;
}

function ActiveSessionRow({
  session,
}: {
  readonly session: CustomerActiveSession;
}) {
  const isMobile = isMobileSessionDevice(session.deviceName);
  const deviceLabel = formatSessionDeviceLabel(session.deviceName);
  const ipLabel = formatSessionIpAddress(session.ipAddress);
  const createdAtLabel = formatSessionTimestamp(session.createdAt);
  const expiresAtLabel = formatSessionTimestamp(session.expiresAt);

  return (
    <li className="flex items-start gap-3 py-3.5 first:pt-1">
      <Badge
        aria-hidden="true"
        variant="secondary"
        className="mt-0.5 size-9 rounded-full bg-gray-100 p-0 [&>svg]:size-4!"
      >
        {isMobile ? (
          <Smartphone className="size-4" />
        ) : (
          <Monitor className="size-4" />
        )}
      </Badge>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold text-gray-900">
            {deviceLabel}
          </span>
          {session.isCurrent ? <Badge>Phiên hiện tại</Badge> : null}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500 tabular-nums">
          <span>IP: {ipLabel}</span>
          <span>Đăng nhập: {createdAtLabel}</span>
          <span>Hết hạn: {expiresAtLabel}</span>
        </div>
      </div>
    </li>
  );
}

/**
 * Pure presentational security section displaying live active sessions (`GET /api/v1/auth/customer/sessions`),
 * empty/degraded inline alerts, and the global revocation confirmation dialog (`INV-SF-PROFILE-7`).
 *
 * @param props Active sessions state, modal visibility, pending/error state, and confirmation handlers.
 * @returns Session security card with live active session rows and confirmed global revocation trigger.
 */
export function SecuritySessionsView({
  sessionsState,
  dialogOpen,
  isPending,
  errorMessage,
  onDialogOpenChange,
  onConfirmLogoutAll,
}: SecuritySessionsViewProps) {
  return (
    <section
      aria-label="Bảo mật phiên đăng nhập"
      className="flex flex-col gap-5"
    >
      <div className="flex flex-col gap-1 border-b border-border-subtle pb-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold text-gray-900 sm:text-lg">
            Bảo mật phiên đăng nhập
          </h2>
          {sessionsState.status === "loaded" ? (
            <span className="text-xs font-semibold text-primary tabular-nums sm:text-sm">
              {sessionsState.sessions.length} phiên hoạt động
            </span>
          ) : null}
        </div>
        <p className="text-xs text-gray-500 sm:text-sm">
          Quản lý các thiết bị đang giữ phiên đăng nhập tài khoản của bạn.
        </p>
      </div>

      {sessionsState.status === "degraded" ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden="true" />
          <AlertTitle>Không thể tải danh sách phiên đăng nhập</AlertTitle>
          <AlertDescription>{sessionsState.errorMessage}</AlertDescription>
        </Alert>
      ) : sessionsState.sessions.length === 0 ? (
        <Alert role="status">
          <Info className="size-4" aria-hidden="true" />
          <AlertTitle>Chưa có phiên đăng nhập nào đang hoạt động</AlertTitle>
          <AlertDescription>
            Hiện chưa ghi nhận phiên đăng nhập nào còn hiệu lực cho tài khoản
            của bạn.
          </AlertDescription>
        </Alert>
      ) : (
        <ul
          aria-label="Danh sách phiên đang hoạt động"
          className="divide-y divide-border-subtle border-b border-border-subtle"
        >
          {sessionsState.sessions.map((session) => (
            <ActiveSessionRow key={session.id} session={session} />
          ))}
        </ul>
      )}

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-gray-900">
            Thu hồi toàn bộ phiên
          </span>
          <span className="text-xs leading-relaxed text-gray-500">
            Đăng xuất ngay lập tức khỏi mọi trình duyệt và điện thoại khác, bao
            gồm cả thiết bị hiện tại.
          </span>
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
    </section>
  );
}

/**
 * Security section hydrating server-fetched active customer sessions alongside a confirmed
 * global session revocation dialog calling `POST /api/v1/auth/logout-all` (`INV-SF-PROFILE-6`, `INV-SF-PROFILE-7`).
 */
export function SecuritySessionsCard({
  sessionsState,
}: SecuritySessionsCardProps) {
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
      sessionsState={sessionsState}
      dialogOpen={dialogOpen}
      isPending={isPending}
      errorMessage={errorMessage}
      onDialogOpenChange={handleDialogOpenChange}
      onConfirmLogoutAll={() => void handleConfirmLogoutAll()}
    />
  );
}

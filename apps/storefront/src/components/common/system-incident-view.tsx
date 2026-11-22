"use client";

import Link from "next/link";
import {
  useEffect,
  useId,
  useSyncExternalStore,
  type ComponentType,
} from "react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  buttonVariants,
} from "@greenroots/ui";
import {
  CloudOff,
  Home,
  LockKeyhole,
  LogIn,
  RefreshCw,
  Wrench,
} from "lucide-react";
import { FARM_METADATA } from "@/constants/farm-metadata.constant";

/**
 * Supported incident presentation modes for Storefront recovery boundaries.
 */
export type IncidentVariant = "500" | "403" | "maintenance";

interface SystemIncidentViewProps {
  readonly variant: IncidentVariant;
  readonly referenceId?: string;
  readonly onRetry?: () => void;
}

interface IncidentConfig {
  readonly icon: ComponentType<{ readonly className?: string }>;
  readonly iconWrapClass: string;
  readonly badge: string;
  readonly badgeClass: string;
  readonly title: string;
  readonly description: string;
  readonly primaryLabel: string;
}

const INCIDENT_CONFIGS: Record<IncidentVariant, IncidentConfig> = {
  "500": {
    icon: CloudOff,
    iconWrapClass: "bg-red-50 text-status-spoiled",
    badge: "MÃ LỖI 500 — SỰ CỐ MÁY CHỦ",
    badgeClass: "bg-red-50 text-red-700",
    title: "Hệ thống đang tạm gián đoạn",
    description:
      "Máy chủ GreenRoots Farm vừa gặp sự cố xử lý tạm thời. Dữ liệu giỏ hàng và đơn hàng của bạn vẫn được lưu an toàn.",
    primaryLabel: "Thử tải lại trang",
  },
  "403": {
    icon: LockKeyhole,
    iconWrapClass: "bg-red-50 text-status-spoiled",
    badge: "MÃ LỖI 403 — KHÔNG CÓ QUYỀN TRUY CẬP",
    badgeClass: "bg-red-50 text-red-700",
    title: "Bạn chưa có quyền xem trang này",
    description:
      "Phiên đăng nhập đã hết hạn hoặc tài khoản hiện tại không có quyền truy cập nội dung được yêu cầu.",
    primaryLabel: "Đăng nhập lại",
  },
  maintenance: {
    icon: Wrench,
    iconWrapClass: "bg-green-50 text-brand-forest",
    badge: "BẢO TRÌ ĐỊNH KỲ — DỰ KIẾN 15 PHÚT",
    badgeClass: "bg-green-50 text-brand-dark",
    title: "Nông trại đang nâng cấp hệ thống",
    description:
      "Chúng tôi đang cập nhật dữ liệu thu hoạch sáng nay để trải nghiệm đặt rau của bạn mượt mà hơn. Vui lòng quay lại sau ít phút.",
    primaryLabel: "Kiểm tra lại ngay",
  },
};

function formatVietnamTimestamp(date: Date): string {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function createClientFallbackRef(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `CLI-${year}${month}${day}-${suffix}`;
}

interface ClientIncidentSnapshot {
  readonly recordedAt: string;
  readonly fallbackRef: string;
}

const snapshotListeners = new Set<() => void>();
const clientIncidentSnapshots = new Map<string, ClientIncidentSnapshot>();

function subscribeIncidentSnapshots(listener: () => void): () => void {
  snapshotListeners.add(listener);
  return () => {
    snapshotListeners.delete(listener);
  };
}

function getServerIncidentSnapshot(): null {
  return null;
}

/**
 * Maps a client-side thrown error's numeric HTTP status without importing server-only API modules.
 *
 * @param error Caught boundary error value.
 * @returns Incident variant matching `403`, `503`, or default `"500"`.
 */
export function classifyClientIncident(error: unknown): IncidentVariant {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    if (error.status === 403) {
      return "403";
    }
    if (error.status === 503) {
      return "maintenance";
    }
  }
  return "500";
}

/**
 * Shared branded incident recovery card rendered across 500, 403, and 503 maintenance screens.
 * Never renders `error.message` or `error.stack`, and populates client clocks/refs inside `useEffect`
 * via an external store snapshot so SSR prerendering under `cacheComponents` stays deterministic.
 *
 * @param props Incident variant, optional server digest, and retry callback.
 * @returns Centered incident recovery card with sanitized diagnostic metadata.
 */
export function SystemIncidentView({
  variant,
  referenceId,
  onRetry,
}: SystemIncidentViewProps) {
  const config = INCIDENT_CONFIGS[variant];
  const Icon = config.icon;
  const instanceId = useId();
  const snapshotKey = `${variant}:${instanceId}`;

  useEffect(() => {
    const now = new Date();
    clientIncidentSnapshots.set(snapshotKey, {
      recordedAt: formatVietnamTimestamp(now),
      fallbackRef: createClientFallbackRef(now),
    });
    for (const listener of snapshotListeners) {
      listener();
    }
    return () => {
      clientIncidentSnapshots.delete(snapshotKey);
    };
  }, [snapshotKey]);

  const clientSnapshot = useSyncExternalStore(
    subscribeIncidentSnapshots,
    () => clientIncidentSnapshots.get(snapshotKey) ?? null,
    getServerIncidentSnapshot,
  );

  const trimmedRef = referenceId?.trim();
  const resolvedRef =
    trimmedRef && trimmedRef.length > 0
      ? trimmedRef
      : (clientSnapshot?.fallbackRef ?? "Đang ghi nhận...");
  const recordedAt = clientSnapshot?.recordedAt ?? "Đang cập nhật...";

  function handleRetryClick() {
    if (variant === "500" && onRetry) {
      onRetry();
      return;
    }
    globalThis.location.reload();
  }

  return (
    <section
      aria-label="Thông báo sự cố hệ thống"
      className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center px-4 py-10 lg:px-6"
    >
      <Card className="w-full max-w-xl gap-0 rounded-2xl border-border-subtle bg-surface-card py-0 shadow-sm">
        <CardContent className="flex flex-col items-center gap-6 p-6 text-center sm:p-8">
          <div className="flex flex-col items-center gap-2">
            <span
              className={`flex size-16 items-center justify-center rounded-full ${config.iconWrapClass}`}
            >
              <Icon className="size-8" aria-hidden="true" />
            </span>
            <Badge
              className={`h-auto rounded-full border-0 px-3 py-1 text-xs font-semibold tracking-wide ${config.badgeClass}`}
            >
              {config.badge}
            </Badge>
          </div>

          <div className="flex flex-col gap-1.5">
            <h1 className="text-[22px] leading-snug font-bold text-gray-900 md:text-[28px]">
              {config.title}
            </h1>
            <p className="text-sm leading-relaxed text-pretty text-gray-500 sm:text-[15px]">
              {config.description}
            </p>
          </div>

          <div className="flex w-full flex-col gap-2 rounded-xl border border-border-subtle bg-surface-warm p-4 text-left text-[13px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-gray-500">Mã tham chiếu</span>
              <span className="font-semibold tracking-wide text-gray-900 tabular-nums">
                {resolvedRef}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-gray-500">Thời điểm ghi nhận</span>
              <span className="font-semibold text-gray-900 tabular-nums">
                {recordedAt}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-2">
              <span className="text-gray-500">Cần hỗ trợ đặt đơn gấp?</span>
              <span className="font-semibold text-brand-forest tabular-nums">
                Hotline {FARM_METADATA.hotline}
              </span>
            </div>
          </div>

          <div className="flex w-full flex-col items-center justify-center gap-2 sm:flex-row">
            {variant === "403" ? (
              <Link
                href="/login"
                className={buttonVariants({
                  className:
                    "h-11 w-full rounded-xl bg-brand-forest px-6 text-sm font-semibold text-white hover:bg-brand-dark sm:w-auto",
                })}
              >
                <LogIn className="size-4" aria-hidden="true" />
                {config.primaryLabel}
              </Link>
            ) : (
              <Button
                type="button"
                onClick={handleRetryClick}
                className="h-11 w-full cursor-pointer rounded-xl bg-brand-forest px-6 text-sm font-semibold text-white hover:bg-brand-dark sm:w-auto"
              >
                <RefreshCw className="size-4" aria-hidden="true" />
                {config.primaryLabel}
              </Button>
            )}

            <Link
              href="/"
              className={buttonVariants({
                variant: "outline",
                className:
                  "h-11 w-full rounded-xl border-border-subtle bg-surface-card px-6 text-sm font-semibold text-gray-900 hover:bg-gray-100 sm:w-auto",
              })}
            >
              <Home className="size-4 text-brand-forest" aria-hidden="true" />
              Quay về trang chủ
            </Link>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

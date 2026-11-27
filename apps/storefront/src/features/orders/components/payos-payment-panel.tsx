"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BUSINESS_RULES, OrderStatus } from "@greenroots/shared";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  buttonVariants,
} from "@greenroots/ui";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  RefreshCw,
  Timer,
  Wrench,
  XCircle,
} from "lucide-react";
import { formatVnd } from "@/lib/format";
import {
  cancelOrderAction,
  confirmMockPayosAction,
  getOrderAction,
} from "../actions/order-actions";
import type { OrderDto } from "../schemas/order.schema";
import {
  computeRemainingSeconds,
  formatCountdownMmSs,
  parseMockPayosOrderCode,
  resolvePayosPanelPhase,
} from "../utils/payos-payment.utils";
import { ReorderButton } from "./reorder-button";

const POLL_INTERVAL_MS = 3000;

interface PayosPaymentPanelProps {
  readonly order: OrderDto;
  readonly initialPaymentQuery?: string;
  readonly onOrderUpdated: (nextOrder: OrderDto) => void;
}

/**
 * PayOS VietQR payment status panel for `/orders/[id]` (`SF-05`).
 * Renders live 15-minute countdown, 3-second visibility-aware status polling,
 * external PayOS checkout link, manual status check, and non-production mock bridge.
 */
export function PayosPaymentPanel({
  order,
  initialPaymentQuery,
  onOrderUpdated,
}: PayosPaymentPanelProps) {
  const router = useRouter();
  const phase = resolvePayosPanelPhase(order);

  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [isCancellingOrder, setIsCancellingOrder] = useState(false);
  const [isTriggeringMock, setIsTriggeringMock] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [justPaid, setJustPaid] = useState(false);

  const isPollingRef = useRef(false);
  const hasAutoCancelledRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const pollLatestOrder = useCallback(
    async (manual: boolean) => {
      if (isPollingRef.current) {
        return;
      }
      isPollingRef.current = true;
      if (manual) {
        setIsCheckingStatus(true);
        setStatusFeedback(null);
        setPanelError(null);
      }

      const result = await getOrderAction(order.id);
      isPollingRef.current = false;

      if (!isMountedRef.current) {
        return;
      }
      if (manual) {
        setIsCheckingStatus(false);
      }

      if (!result.ok) {
        if (result.sessionInvalidated) {
          router.replace(
            `/login?redirect=${encodeURIComponent(`/orders/${order.id}`)}`,
          );
          return;
        }
        if (manual) {
          setPanelError(result.message);
        }
        return;
      }

      if (
        order.orderStatus === OrderStatus.PENDING_PAYMENT &&
        result.order.orderStatus !== OrderStatus.PENDING_PAYMENT &&
        result.order.orderStatus !== OrderStatus.CANCELLED
      ) {
        setJustPaid(true);
      }

      if (manual && result.order.orderStatus === OrderStatus.PENDING_PAYMENT) {
        setStatusFeedback(
          "Hệ thống vẫn đang chờ xác nhận chuyển khoản từ PayOS.",
        );
      }

      onOrderUpdated(result.order);
    },
    [onOrderUpdated, order.id, order.orderStatus, router],
  );

  const handleCancelOrder = useCallback(async () => {
    if (isCancellingOrder) {
      return;
    }

    setIsCancellingOrder(true);
    setStatusFeedback(null);
    setPanelError(null);

    const result = await cancelOrderAction(order.id);
    if (!isMountedRef.current) {
      return;
    }

    setIsCancellingOrder(false);

    if (!result.ok) {
      if (result.sessionInvalidated) {
        router.replace(
          `/login?redirect=${encodeURIComponent(`/orders/${order.id}`)}`,
        );
        return;
      }
      setPanelError(result.message);
      await pollLatestOrder(false);
      return;
    }

    onOrderUpdated(result.order);
  }, [isCancellingOrder, onOrderUpdated, order.id, pollLatestOrder, router]);

  // Auto-cancel when returning from PayOS cancelUrl (`?payment=cancelled`) because PayOS permanently voids the link.
  useEffect(() => {
    if (
      phase !== "pending" ||
      initialPaymentQuery !== "cancelled" ||
      hasAutoCancelledRef.current
    ) {
      return;
    }
    hasAutoCancelledRef.current = true;
    void handleCancelOrder();
  }, [handleCancelOrder, initialPaymentQuery, phase]);

  // Compute countdown only on the client to avoid SSR/hydration timestamp mismatch.
  useEffect(() => {
    if (phase !== "pending") {
      return;
    }

    const syncRemaining = () => {
      setRemainingSeconds(computeRemainingSeconds(order.reservationExpiresAt));
    };

    syncRemaining();
    const intervalId = setInterval(syncRemaining, 1000);
    return () => clearInterval(intervalId);
  }, [order.reservationExpiresAt, phase]);

  // Recursive 3-second polling paused while the browser tab is hidden.
  useEffect(() => {
    if (phase !== "pending") {
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const scheduleNext = () => {
      if (cancelled || document.visibilityState === "hidden") {
        return;
      }
      timeoutId = setTimeout(() => {
        void pollLatestOrder(false).then(() => {
          scheduleNext();
        });
      }, POLL_INTERVAL_MS);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        void pollLatestOrder(false).then(() => {
          scheduleNext();
        });
      } else if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    scheduleNext();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [phase, pollLatestOrder]);

  if (phase === "none") {
    return null;
  }

  // Only show the dedicated success banner when paid during this session or via PayOS returnUrl.
  if (phase === "success") {
    if (!justPaid && initialPaymentQuery !== "success") {
      return null;
    }

    return (
      <section
        aria-label="Thanh toán PayOS thành công"
        className="flex flex-col gap-4 border-b border-border-subtle pb-6"
      >
        <Alert variant="success">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          <AlertTitle>Thanh toán thành công!</AlertTitle>
          <AlertDescription>
            Hệ thống đã xác nhận giao dịch {formatVnd(order.totalAmountVnd)}.
            Nông trại đang chuẩn bị đơn hàng tươi cắt cho bạn.
          </AlertDescription>
          <div className="col-start-2 mt-2.5 flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            <Link
              href="/account/orders"
              className={buttonVariants({
                size: "sm",
                className:
                  "w-full justify-center bg-brand-forest font-semibold text-white hover:bg-brand-dark sm:w-auto",
              })}
            >
              Xem đơn hàng của tôi
            </Link>
            <Link
              href="/"
              className={buttonVariants({
                variant: "outline",
                size: "sm",
                className: "w-full justify-center sm:w-auto",
              })}
            >
              Về trang chủ
            </Link>
          </div>
        </Alert>
      </section>
    );
  }

  if (phase === "expired") {
    const isOrderCancelled = order.orderStatus === OrderStatus.CANCELLED;
    return (
      <section
        aria-label="Phiên thanh toán đã kết thúc"
        className="flex flex-col gap-4 border-b border-border-subtle pb-6"
      >
        <Alert variant="destructive">
          <Clock className="size-4" aria-hidden="true" />
          <AlertTitle>
            {isOrderCancelled
              ? "Phiên thanh toán PayOS đã bị hủy"
              : "Phiên thanh toán đã hết hạn"}
          </AlertTitle>
          <AlertDescription>
            {isOrderCancelled
              ? "Liên kết thanh toán PayOS đã bị hủy nên không thể tiếp tục thanh toán. Bạn có thể đặt lại đơn hàng mới từ giỏ hàng."
              : `Đã quá thời gian giữ mã VietQR (${BUSINESS_RULES.ORDER_PAYMENT_TIMEOUT_MINUTES} phút) hoặc đơn đã bị hủy. Bạn có thể đặt lại đơn hàng mới từ giỏ hàng.`}
          </AlertDescription>
          <div className="col-start-2 mt-2.5 flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            <ReorderButton
              order={order}
              variant="default"
              size="sm"
              className="w-full justify-center sm:w-auto"
            />
            <Link
              href="/cart"
              className={buttonVariants({
                variant: "outline",
                size: "sm",
                className: "w-full justify-center sm:w-auto",
              })}
            >
              Quay lại giỏ hàng
            </Link>
          </div>
        </Alert>
      </section>
    );
  }

  const mockOrderCode = parseMockPayosOrderCode(order.paymentUrl);
  const allowMockBridge =
    process.env.NODE_ENV !== "production" && mockOrderCode !== null;
  const isTimerElapsed = remainingSeconds !== null && remainingSeconds <= 0;

  async function handleTriggerMockPayment() {
    if (!order.paymentUrl || isTriggeringMock) {
      return;
    }

    setPanelError(null);
    setStatusFeedback(null);
    setIsTriggeringMock(true);

    const result = await confirmMockPayosAction({
      orderId: order.id,
      paymentUrl: order.paymentUrl,
      amountVnd: order.totalAmountVnd,
      orderCode: order.orderCode,
    });

    setIsTriggeringMock(false);

    if (!result.ok) {
      setPanelError(result.message);
      return;
    }

    await pollLatestOrder(false);
  }

  return (
    <section
      aria-label="Chờ thanh toán PayOS"
      className="flex flex-col gap-4 border-b border-border-subtle pb-6"
    >
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-green-50 text-brand-forest">
            <RefreshCw className="size-5 animate-spin" aria-hidden="true" />
          </span>
          <div className="space-y-0.5">
            <h2 className="text-base font-bold text-gray-900">
              Đang chờ xác nhận chuyển khoản PayOS
            </h2>
            <p className="text-xs text-gray-600">
              {isTimerElapsed
                ? "Đã hết thời gian giữ mã — đang xác nhận trạng thái hủy đơn từ hệ thống..."
                : `Hệ thống tự động kiểm tra mỗi 3 giây và cập nhật ngay khi nhận được ${formatVnd(order.totalAmountVnd)}.`}
            </p>
          </div>
        </div>

        <div className="flex w-full shrink-0 items-center justify-between gap-2.5 rounded-md border border-border-subtle bg-surface-warm px-3.5 py-2 sm:w-auto sm:justify-start">
          <div className="flex items-center gap-2">
            <Timer className="size-4 text-status-spoiled" aria-hidden="true" />
            <span className="text-xs font-semibold text-gray-600">
              Thời gian giữ mã
            </span>
          </div>
          <span className="text-base font-extrabold text-status-spoiled tabular-nums">
            {remainingSeconds === null
              ? "--:--"
              : formatCountdownMmSs(remainingSeconds)}
          </span>
        </div>
      </div>

      {initialPaymentQuery === "cancelled" ? (
        <Alert>
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertDescription>
            {isCancellingOrder
              ? "Bạn đã hủy trên cổng PayOS — hệ thống đang hủy đơn và hoàn giữ chỗ..."
              : "Liên kết thanh toán PayOS đã bị hủy nên không thể tiếp tục thanh toán."}
          </AlertDescription>
        </Alert>
      ) : null}

      {panelError ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertDescription>{panelError}</AlertDescription>
        </Alert>
      ) : null}

      {statusFeedback ? (
        <Alert>
          <Clock className="size-4" aria-hidden="true" />
          <AlertDescription>{statusFeedback}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        {order.paymentUrl &&
        mockOrderCode === null &&
        initialPaymentQuery !== "cancelled" ? (
          <a
            href={order.paymentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({
              className:
                "w-full justify-center gap-2 bg-brand-forest font-bold text-white hover:bg-brand-dark sm:w-auto",
            })}
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            <span>Mở trang thanh toán PayOS</span>
          </a>
        ) : null}

        <Button
          type="button"
          variant="outline"
          disabled={isCheckingStatus || isCancellingOrder}
          onClick={() => void pollLatestOrder(true)}
          className="w-full justify-center gap-2 sm:w-auto"
        >
          {isCheckingStatus ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="size-4" aria-hidden="true" />
          )}
          <span>Kiểm tra trạng thái thanh toán</span>
        </Button>

        <Button
          type="button"
          variant="outline"
          disabled={isCancellingOrder || isCheckingStatus}
          onClick={() => void handleCancelOrder()}
          className="w-full justify-center gap-2 text-destructive hover:text-destructive sm:w-auto"
        >
          {isCancellingOrder ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <XCircle className="size-4" aria-hidden="true" />
          )}
          <span>Hủy đơn hàng</span>
        </Button>

        {allowMockBridge ? (
          <Button
            type="button"
            variant="secondary"
            disabled={isTriggeringMock || isCancellingOrder}
            onClick={() => void handleTriggerMockPayment()}
            className="w-full justify-center gap-2 sm:w-auto"
          >
            {isTriggeringMock ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Wrench className="size-4" aria-hidden="true" />
            )}
            <span>Giả lập thanh toán thành công (Dev)</span>
          </Button>
        ) : null}
      </div>
    </section>
  );
}

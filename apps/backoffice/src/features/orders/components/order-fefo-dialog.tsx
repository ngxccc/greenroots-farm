import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@greenroots/shared";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@greenroots/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  PackageCheck,
  Zap,
} from "lucide-react";
import { useState } from "react";
import {
  confirmOrderFefo,
  ORDERS_QUERY_KEYS,
  OrdersApiError,
} from "../orders.api";
import {
  canConfirmOrderFefo,
  formatViDate,
  formatViDateTime,
  formatVnd,
  getActiveAllocations,
  getDeliveryScheduleCue,
  getOrderCodDisplay,
  ORDER_STATUS_BADGE_CLASSES,
  type StaffOrderDto,
} from "../orders.utils";

export interface OrderFefoDialogProps {
  readonly order: StaffOrderDto | null;
  readonly open: boolean;
  readonly canManage: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirmed?: (updated: StaffOrderDto) => void;
}

/**
 * Modal inspecting order items, FEFO batch allocations, and triggering atomic FEFO confirmation.
 */
export function OrderFefoDialog({
  order,
  open,
  canManage,
  onOpenChange,
  onConfirmed,
}: OrderFefoDialogProps) {
  const queryClient = useQueryClient();
  const [displayedOrder, setDisplayedOrder] = useState<StaffOrderDto | null>(
    order,
  );
  const [confirmSuccess, setConfirmSuccess] = useState(false);
  const [errorState, setErrorState] = useState<{
    readonly status?: number;
    readonly message: string;
  } | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    crypto.randomUUID(),
  );

  const confirmMutation = useMutation({
    mutationFn: (targetOrderId: string) =>
      confirmOrderFefo(targetOrderId, idempotencyKey),
    onSuccess: (updated) => {
      setDisplayedOrder(updated);
      setConfirmSuccess(true);
      setErrorState(null);
      void queryClient.invalidateQueries({ queryKey: ORDERS_QUERY_KEYS.all });
      onConfirmed?.(updated);
    },
    onError: (err) => {
      setConfirmSuccess(false);
      if (err instanceof OrdersApiError) {
        setErrorState({ status: err.status, message: err.message });
      } else {
        setErrorState({
          message:
            err instanceof Error
              ? err.message
              : "Không thể xác nhận đơn hàng và phân bổ FEFO.",
        });
      }
      setIdempotencyKey(crypto.randomUUID());
    },
  });

  if (!displayedOrder) {
    return null;
  }

  const codDisplay = getOrderCodDisplay(displayedOrder);
  const scheduleCue = getDeliveryScheduleCue(
    displayedOrder.createdAt,
    displayedOrder.shippingAddress,
  );
  const activeAllocations = getActiveAllocations(displayedOrder);
  const isConfirmable =
    canManage && canConfirmOrderFefo(displayedOrder.orderStatus);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span>Chi tiết đơn {displayedOrder.orderCode}</span>
            <Badge
              variant="outline"
              className={ORDER_STATUS_BADGE_CLASSES[displayedOrder.orderStatus]}
            >
              {ORDER_STATUS_LABELS[displayedOrder.orderStatus]}
            </Badge>
            {codDisplay.badgeLabel ? (
              <Badge variant="secondary">{codDisplay.badgeLabel}</Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            Tạo lúc{" "}
            <span className="tabular-nums">
              {formatViDateTime(displayedOrder.createdAt)}
            </span>{" "}
            · {scheduleCue.dayLabel} ({scheduleCue.routeCue})
          </DialogDescription>
        </DialogHeader>

        {errorState ? (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" aria-hidden="true" />
            <AlertTitle>
              {errorState.status === 409
                ? "Không đủ tồn kho FEFO hoặc xung đột trạng thái"
                : "Không thể xác nhận FEFO"}
            </AlertTitle>
            <AlertDescription>{errorState.message}</AlertDescription>
          </Alert>
        ) : null}

        {confirmSuccess ? (
          <Alert variant="success">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            <AlertTitle>Đã xác nhận đơn và giữ lô FEFO thành công</AlertTitle>
            <AlertDescription>
              Đơn {displayedOrder.orderCode} đã chuyển sang trạng thái{" "}
              {ORDER_STATUS_LABELS[displayedOrder.orderStatus]} với{" "}
              <span className="font-semibold tabular-nums">
                {activeAllocations.length}
              </span>{" "}
              lô được giữ.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 border-b border-border-subtle pb-4 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase">
                Người nhận
              </p>
              <p className="font-semibold text-gray-900">
                {displayedOrder.receiverName}
              </p>
              <p className="text-gray-600 tabular-nums">
                {displayedOrder.receiverPhone}
              </p>
              <p className="mt-0.5 text-xs text-gray-600">
                {displayedOrder.shippingAddress}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase">
                Thanh toán &amp; Thu hộ
              </p>
              <p className="font-medium text-gray-900">
                {PAYMENT_METHOD_LABELS[displayedOrder.paymentMethod]} ·{" "}
                {codDisplay.paymentStatusLabel}
              </p>
              <p className="text-gray-700 tabular-nums">
                Tổng đơn:{" "}
                <span className="font-semibold">
                  {formatVnd(displayedOrder.totalAmountVnd)}
                </span>
              </p>
              <p className="text-gray-700 tabular-nums">
                Cần thu COD:{" "}
                <span className="font-semibold text-brand-forest">
                  {formatVnd(codDisplay.codVnd)}
                </span>
              </p>
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold text-gray-500 uppercase">
              Sản phẩm đặt mua ({displayedOrder.items.length})
            </h4>
            <ul className="divide-y divide-border-subtle border-y border-border-subtle text-sm">
              {displayedOrder.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">
                      {item.productName}
                    </p>
                    <p className="text-xs text-gray-500 tabular-nums">
                      {item.quantity} {item.unit} ×{" "}
                      {formatVnd(item.unitPriceVnd)}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold text-gray-900 tabular-nums">
                    {formatVnd(item.lineTotalVnd)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase">
              <PackageCheck className="size-3.5" aria-hidden="true" />
              <span>Phân bổ lô FEFO ({activeAllocations.length})</span>
            </h4>
            {activeAllocations.length === 0 ? (
              <p className="text-sm text-gray-500">
                Chưa có lô FEFO đang giữ cho đơn hàng này.
              </p>
            ) : (
              <ul className="divide-y divide-border-subtle border-y border-border-subtle text-sm">
                {activeAllocations.map((alloc) => (
                  <li
                    key={alloc.allocationId}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <div className="min-w-0">
                      <span className="font-semibold text-brand-forest tabular-nums">
                        {alloc.batchCode}
                      </span>{" "}
                      <span className="text-gray-700">
                        — {alloc.productName}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-600 tabular-nums">
                      <span>HSD: {formatViDate(alloc.expirationDate)}</span>
                      <Badge variant="outline" className="tabular-nums">
                        SL: {alloc.allocatedQuantity} {alloc.unit}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Đóng
          </Button>
          {isConfirmable ? (
            <Button
              type="button"
              disabled={confirmMutation.isPending}
              onClick={() => confirmMutation.mutate(displayedOrder.id)}
              className="gap-1.5"
            >
              {confirmMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Zap className="size-4" aria-hidden="true" />
              )}
              <span>Xác nhận giữ lô FEFO</span>
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

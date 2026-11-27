import { OrderStatus } from "@greenroots/shared";
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@greenroots/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useState } from "react";
import { ORDERS_QUERY_KEYS, updateOrderStatus } from "../orders.api";
import {
  doesCancellationReleaseStock,
  type StaffOrderDto,
} from "../orders.utils";

export interface OrderCancelDialogProps {
  readonly order: StaffOrderDto | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCancelled?: (updated: StaffOrderDto) => void;
}

/**
 * Confirmation dialog explaining FEFO stock release before cancelling an order.
 */
export function OrderCancelDialog({
  order,
  open,
  onOpenChange,
  onCancelled,
}: OrderCancelDialogProps) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const cancelMutation = useMutation({
    mutationFn: (orderId: string) =>
      updateOrderStatus(orderId, OrderStatus.CANCELLED),
    onSuccess: (updated) => {
      setErrorMessage(null);
      void queryClient.invalidateQueries({ queryKey: ORDERS_QUERY_KEYS.all });
      onOpenChange(false);
      onCancelled?.(updated);
    },
    onError: (err) => {
      setErrorMessage(
        err instanceof Error ? err.message : "Không thể hủy đơn hàng.",
      );
    },
  });

  if (!order) {
    return null;
  }

  const releasesStock = doesCancellationReleaseStock(order.orderStatus);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Xác nhận hủy đơn {order.orderCode}</DialogTitle>
          <DialogDescription>
            Hành động này không thể hoàn tác. Vui lòng kiểm tra kỹ trước khi hủy
            đơn của khách hàng {order.receiverName}.
          </DialogDescription>
        </DialogHeader>

        {releasesStock ? (
          <Alert>
            <AlertTriangle className="size-4" aria-hidden="true" />
            <AlertDescription>
              Hủy đơn ở trạng thái hiện tại sẽ tự động giải phóng toàn bộ lô
              FEFO đang giữ, cộng trả lại tồn kho khả dụng và hoàn lại điểm
              thưởng (nếu có).
            </AlertDescription>
          </Alert>
        ) : null}

        {errorMessage ? (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" aria-hidden="true" />
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Giữ lại đơn
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={cancelMutation.isPending}
            onClick={() => cancelMutation.mutate(order.id)}
            className="gap-1.5"
          >
            {cancelMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            <span>Xác nhận hủy đơn</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

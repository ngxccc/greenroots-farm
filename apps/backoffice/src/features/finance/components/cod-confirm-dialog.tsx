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
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";
import { confirmCodPayment, FINANCE_QUERY_KEYS } from "../finance.api";
import { formatVnd, type PaymentLedgerItemDto } from "../finance.utils";

export interface CodConfirmDialogProps {
  readonly payment: PaymentLedgerItemDto | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirmed?: (updated: PaymentLedgerItemDto) => void;
}

/**
 * Confirmation dialog for settling a pending Cash-on-Delivery (COD) payment
 * via `POST /api/v1/payments/:id/confirm-cod` with an `Idempotency-Key` header.
 */
export function CodConfirmDialog({
  payment,
  open,
  onOpenChange,
  onConfirmed,
}: CodConfirmDialogProps) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const confirmMutation = useMutation({
    mutationFn: (paymentId: string) =>
      confirmCodPayment(paymentId, crypto.randomUUID()),
    onSuccess: (updated) => {
      setErrorMessage(null);
      void queryClient.invalidateQueries({ queryKey: FINANCE_QUERY_KEYS.all });
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      onOpenChange(false);
      onConfirmed?.(updated);
    },
    onError: (err) => {
      setErrorMessage(
        err instanceof Error ? err.message : "Không thể xác nhận thu tiền COD.",
      );
    },
  });

  if (!payment) {
    return null;
  }

  const targetCode =
    payment.orderCode ?? payment.subscriptionCode ?? payment.id;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setErrorMessage(null);
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Xác nhận thu tiền COD</DialogTitle>
          <DialogDescription>
            Xác nhận đã thu đủ tiền mặt cho chứng từ{" "}
            <span className="font-semibold text-gray-900 tabular-nums">
              {targetCode}
            </span>{" "}
            với số tiền{" "}
            <span className="font-semibold text-brand-dark tabular-nums">
              {formatVnd(payment.amountVnd)}
            </span>
            .
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <CheckCircle2 className="size-4" aria-hidden="true" />
          <AlertDescription>
            Thao tác này sẽ ghi nhận người đối soát và đồng bộ trạng thái đã
            thanh toán cho đơn hàng tương ứng.
          </AlertDescription>
        </Alert>

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
            Hủy bỏ
          </Button>
          <Button
            type="button"
            disabled={confirmMutation.isPending}
            onClick={() => confirmMutation.mutate(payment.id)}
            className="gap-1.5 bg-brand-forest text-white hover:bg-brand-dark"
          >
            {confirmMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            <span>Xác nhận đã thu COD</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

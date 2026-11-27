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
import { AlertCircle, AlertTriangle, Loader2 } from "lucide-react";
import { useState } from "react";
import { useAuthStore } from "@/features/auth/stores/auth.store";
import {
  SUBSCRIPTION_PLANS_QUERY_KEYS,
  updateSubscriptionPlan,
} from "../plans-api";
import {
  evaluatePlanMutationGuard,
  type SubscriptionPlanDto,
} from "../plans-utils";

interface PlanStatusDialogProps {
  readonly plan: SubscriptionPlanDto | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCompleted: (message: string) => void;
}

/**
 * Confirmation dialog for soft-retiring or reactivating a seasonal subscription plan.
 */
export function PlanStatusDialog({
  plan,
  onOpenChange,
  onCompleted,
}: PlanStatusDialogProps) {
  const queryClient = useQueryClient();
  const currentRole = useAuthStore((state) => state.user?.role);
  const mutationGuard = evaluatePlanMutationGuard(currentRole);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isRetiring = plan?.isActive ?? true;
  const activeCount = plan?.activeSubscriberCount ?? 0;

  const statusMutation = useMutation({
    mutationFn: async (targetPlan: SubscriptionPlanDto) =>
      updateSubscriptionPlan(targetPlan.id, {
        isActive: !targetPlan.isActive,
      }),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({
        queryKey: SUBSCRIPTION_PLANS_QUERY_KEYS.adminList,
      });
      onCompleted(
        updated.isActive
          ? `Đã mở bán lại gói "${updated.name}".`
          : `Đã ngừng bán gói "${updated.name}".`,
      );
      setErrorMessage(null);
      onOpenChange(false);
    },
    onError: (err) => {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Không thể cập nhật trạng thái gói định kỳ.",
      );
    },
  });

  function handleConfirm() {
    if (!plan) return;
    setErrorMessage(null);
    if (!mutationGuard.allowed) {
      setErrorMessage(mutationGuard.reason);
      return;
    }
    statusMutation.mutate(plan);
  }

  return (
    <Dialog
      open={Boolean(plan)}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setErrorMessage(null);
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="bg-surface-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isRetiring ? "Ngừng bán gói định kỳ" : "Mở bán lại gói định kỳ"}
          </DialogTitle>
          <DialogDescription>
            {isRetiring
              ? `Xác nhận ngừng nhận đăng ký mới cho gói "${plan?.name ?? ""}".`
              : `Xác nhận hiển thị lại gói "${plan?.name ?? ""}" trên trang khách hàng.`}
          </DialogDescription>
        </DialogHeader>

        {errorMessage ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" aria-hidden="true" />
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        {isRetiring && activeCount > 0 ? (
          <Alert>
            <AlertTriangle className="size-4" aria-hidden="true" />
            <AlertDescription className="tabular-nums">
              Gói này hiện có <strong>{activeCount}</strong> khách hàng đang sử
              dụng. Việc ngừng bán chỉ ẩn gói khỏi danh sách đăng ký mới — toàn
              bộ lịch giao và quyền lợi của khách hàng hiện tại vẫn được giữ
              nguyên.
            </AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={statusMutation.isPending}
          >
            Hủy
          </Button>
          <Button
            type="button"
            variant={isRetiring ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={statusMutation.isPending}
            className={
              isRetiring
                ? undefined
                : "bg-brand-forest text-white hover:bg-brand-dark"
            }
          >
            {statusMutation.isPending ? (
              <>
                <Loader2
                  className="mr-2 size-4 animate-spin"
                  aria-hidden="true"
                />
                Đang xử lý...
              </>
            ) : isRetiring ? (
              "Xác nhận ngừng bán"
            ) : (
              "Xác nhận mở bán"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { WasteLogStatus } from "@greenroots/shared";
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
  Label,
  Textarea,
} from "@greenroots/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ImageOff,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { useAuthStore } from "@/features/auth/stores/auth.store";
import {
  approveWasteLog,
  rejectWasteLog,
  WASTE_QUERY_KEYS,
} from "../waste-api";
import {
  calculateRemainingAfterWaste,
  evaluateWasteReviewGuard,
  filterSafeProofMediaUrls,
  formatWasteTimestamp,
  REJECTION_REASON_MAX_LENGTH,
  validateRejectionReason,
  WASTE_STATUS_META,
  type WasteLogDto,
} from "../waste-utils";

interface WasteDetailDialogProps {
  readonly wasteLog: WasteLogDto | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onReviewed: (message: string) => void;
}

/**
 * Detail and 2-step review dialog for a waste write-off proposal.
 * Enforces 4-eyes non-self-review, proof media URL validation,
 * approve impact confirmation, and mandatory rejection reason entry.
 */
export function WasteDetailDialog({
  wasteLog,
  open,
  onOpenChange,
  onReviewed,
}: WasteDetailDialogProps) {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);

  const [confirmApproveOpen, setConfirmApproveOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [rejectFormError, setRejectFormError] = useState<string | null>(null);

  function handleMainOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setConfirmApproveOpen(false);
      setRejectDialogOpen(false);
      setRejectionReason("");
      setActionError(null);
      setRejectFormError(null);
    }
    onOpenChange(nextOpen);
  }

  const approveMutation = useMutation({
    mutationFn: (id: string) => approveWasteLog(id, crypto.randomUUID()),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: WASTE_QUERY_KEYS.all });
      setConfirmApproveOpen(false);
      onOpenChange(false);
      onReviewed(
        `Đã phê duyệt xuất hủy lô ${updated.batch.batchCode} (-${updated.discardedQuantity} ${updated.batch.unit}).`,
      );
    },
    onError: (err) => {
      setConfirmApproveOpen(false);
      setActionError(
        err instanceof Error
          ? err.message
          : "Không thể phê duyệt phiếu xuất hủy.",
      );
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (input: { id: string; rejectionReason: string }) =>
      rejectWasteLog(
        input.id,
        { rejectionReason: input.rejectionReason },
        crypto.randomUUID(),
      ),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: WASTE_QUERY_KEYS.all });
      setRejectDialogOpen(false);
      onOpenChange(false);
      onReviewed(`Đã từ chối phiếu xuất hủy lô ${updated.batch.batchCode}.`);
    },
    onError: (err) => {
      setRejectFormError(
        err instanceof Error
          ? err.message
          : "Không thể từ chối phiếu xuất hủy.",
      );
    },
  });

  if (!wasteLog) {
    return null;
  }

  const statusMeta = WASTE_STATUS_META[wasteLog.status];
  const guard = evaluateWasteReviewGuard(wasteLog, currentUser);
  const safeMediaUrls = filterSafeProofMediaUrls(wasteLog.mediaUrls);
  const skippedMediaCount = wasteLog.mediaUrls.length - safeMediaUrls.length;
  const stockImpact = calculateRemainingAfterWaste(
    wasteLog.batch.availableQuantity,
    wasteLog.discardedQuantity,
  );
  const isPending = wasteLog.status === WasteLogStatus.PENDING_APPROVAL;
  const isMutating = approveMutation.isPending || rejectMutation.isPending;

  function handleOpenRejectDialog() {
    setActionError(null);
    setRejectFormError(null);
    setRejectionReason("");
    setRejectDialogOpen(true);
  }

  function handleSubmitReject() {
    if (!wasteLog) {
      return;
    }
    const validation = validateRejectionReason(rejectionReason);
    if (!validation.valid) {
      setRejectFormError(validation.error);
      return;
    }
    setRejectFormError(null);
    rejectMutation.mutate({
      id: wasteLog.id,
      rejectionReason: validation.value,
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleMainOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle>Chi tiết phiếu xuất hủy</DialogTitle>
              <Badge variant="outline" className={statusMeta.badgeClassName}>
                {statusMeta.label}
              </Badge>
            </div>
            <DialogDescription>
              Mã lô{" "}
              <span className="font-semibold text-gray-900 tabular-nums">
                {wasteLog.batch.batchCode}
              </span>{" "}
              — {wasteLog.batch.productName}
            </DialogDescription>
          </DialogHeader>

          <div className="divide-y divide-border-subtle text-sm">
            {actionError ? (
              <div className="pb-4">
                <Alert variant="destructive">
                  <AlertCircle className="size-4" aria-hidden="true" />
                  <AlertDescription>{actionError}</AlertDescription>
                </Alert>
              </div>
            ) : null}

            {isPending && !guard.canReview && guard.reason ? (
              <div className="py-3 first:pt-0">
                <Alert variant="destructive">
                  <AlertTriangle className="size-4" aria-hidden="true" />
                  <AlertTitle>Không thể tự phê duyệt</AlertTitle>
                  <AlertDescription>{guard.reason}</AlertDescription>
                </Alert>
              </div>
            ) : null}

            {isPending && stockImpact.exceedsAvailable ? (
              <div className="py-3 first:pt-0">
                <Alert variant="destructive">
                  <AlertTriangle className="size-4" aria-hidden="true" />
                  <AlertTitle>
                    Số lượng đề xuất vượt tồn kho khả dụng
                  </AlertTitle>
                  <AlertDescription className="tabular-nums">
                    Đề xuất hủy {wasteLog.discardedQuantity}{" "}
                    {wasteLog.batch.unit}, nhưng tồn kho khả dụng hiện tại chỉ
                    còn {wasteLog.batch.availableQuantity} {wasteLog.batch.unit}
                    .
                  </AlertDescription>
                </Alert>
              </div>
            ) : null}

            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 py-4 first:pt-0 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-gray-500">
                  Sản phẩm &amp; Lô hàng
                </dt>
                <dd className="mt-0.5 font-medium text-gray-900">
                  {wasteLog.batch.productName}{" "}
                  <span className="text-gray-500 tabular-nums">
                    ({wasteLog.batch.batchCode})
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">
                  Số lượng đề xuất hủy
                </dt>
                <dd className="mt-0.5 font-semibold text-destructive tabular-nums">
                  -{wasteLog.discardedQuantity} {wasteLog.batch.unit}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">
                  Tồn kho khả dụng hiện tại
                </dt>
                <dd className="mt-0.5 font-medium text-gray-900 tabular-nums">
                  {wasteLog.batch.availableQuantity} {wasteLog.batch.unit}
                  {isPending ? (
                    <span className="ml-2 text-xs text-gray-500">
                      (Sau duyệt: {stockImpact.remainingQuantity}{" "}
                      {wasteLog.batch.unit})
                    </span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">
                  Người đề xuất
                </dt>
                <dd className="mt-0.5 font-medium text-gray-900">
                  {wasteLog.reporter.fullName}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">
                  Thời gian đề xuất
                </dt>
                <dd className="mt-0.5 text-gray-700 tabular-nums">
                  {formatWasteTimestamp(wasteLog.createdAt)}
                </dd>
              </div>
              {wasteLog.reviewer ? (
                <div>
                  <dt className="text-xs font-medium text-gray-500">
                    Người thẩm định
                  </dt>
                  <dd className="mt-0.5 font-medium text-gray-900">
                    {wasteLog.reviewer.fullName}
                    {wasteLog.reviewedAt ? (
                      <span className="ml-2 text-xs font-normal text-gray-500 tabular-nums">
                        ({formatWasteTimestamp(wasteLog.reviewedAt)})
                      </span>
                    ) : null}
                  </dd>
                </div>
              ) : null}
            </dl>

            <div className="space-y-1.5 py-4">
              <p className="text-xs font-medium text-gray-500">
                Lý do đề xuất xuất hủy
              </p>
              <p className="whitespace-pre-wrap text-gray-900">
                {wasteLog.reason}
              </p>
            </div>

            {wasteLog.rejectionReason ? (
              <div className="space-y-1.5 py-4">
                <p className="text-xs font-medium text-destructive">
                  Lý do từ chối
                </p>
                <p className="whitespace-pre-wrap text-gray-900">
                  {wasteLog.rejectionReason}
                </p>
              </div>
            ) : null}

            <div className="space-y-3 py-4 last:pb-0">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-500">
                  Ảnh bằng chứng hiện trường ({safeMediaUrls.length})
                </p>
                {skippedMediaCount > 0 ? (
                  <span className="text-xs text-amber-700 tabular-nums">
                    Đã ẩn {skippedMediaCount} liên kết không hợp lệ
                  </span>
                ) : null}
              </div>

              {safeMediaUrls.length === 0 ? (
                <div className="flex items-center gap-2 py-4 text-xs text-gray-500">
                  <ImageOff className="size-4" aria-hidden="true" />
                  <span>Không có ảnh bằng chứng hợp lệ cho phiếu này.</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {safeMediaUrls.map((url, index) => (
                    <a
                      key={`${url}-${index}`}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative overflow-hidden rounded-lg border border-border-subtle bg-surface-card focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:outline-none"
                    >
                      <img
                        src={url}
                        alt={`Bằng chứng xuất hủy ${index + 1} của lô ${wasteLog.batch.batchCode}`}
                        loading="lazy"
                        className="h-36 w-full object-cover transition-transform duration-150 group-hover:scale-[1.02]"
                      />
                      <span className="flex items-center justify-between px-2.5 py-1.5 text-xs font-medium text-gray-700">
                        <span className="tabular-nums">Ảnh #{index + 1}</span>
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleMainOpenChange(false)}
              disabled={isMutating}
            >
              Đóng
            </Button>
            {isPending ? (
              <>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={!guard.canReview || isMutating}
                  onClick={handleOpenRejectDialog}
                >
                  <XCircle className="mr-1.5 size-4" aria-hidden="true" />
                  Từ chối
                </Button>
                <Button
                  type="button"
                  disabled={
                    !guard.canReview ||
                    isMutating ||
                    stockImpact.exceedsAvailable
                  }
                  onClick={() => {
                    setActionError(null);
                    setConfirmApproveOpen(true);
                  }}
                  className="bg-brand-forest text-white hover:bg-brand-dark"
                >
                  <CheckCircle2 className="mr-1.5 size-4" aria-hidden="true" />
                  Phê duyệt xuất hủy
                </Button>
              </>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmApproveOpen} onOpenChange={setConfirmApproveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Xác nhận phê duyệt xuất hủy</DialogTitle>
            <DialogDescription>
              Thao tác này sẽ trừ tồn kho khả dụng của lô hàng ngay lập tức và
              không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>

          <dl className="divide-y divide-border-subtle text-sm">
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-gray-600">Lô hàng</dt>
              <dd className="font-semibold text-gray-900 tabular-nums">
                {wasteLog.batch.batchCode}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-gray-600">Sản phẩm</dt>
              <dd className="font-medium text-gray-900">
                {wasteLog.batch.productName}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-gray-600">Số lượng xuất hủy</dt>
              <dd className="font-semibold text-destructive tabular-nums">
                -{wasteLog.discardedQuantity} {wasteLog.batch.unit}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-gray-600">Tồn kho sau duyệt</dt>
              <dd className="font-semibold text-gray-900 tabular-nums">
                {wasteLog.batch.availableQuantity} →{" "}
                {stockImpact.remainingQuantity} {wasteLog.batch.unit}
              </dd>
            </div>
          </dl>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmApproveOpen(false)}
              disabled={approveMutation.isPending}
            >
              Quay lại
            </Button>
            <Button
              type="button"
              disabled={approveMutation.isPending}
              onClick={() => approveMutation.mutate(wasteLog.id)}
              className="bg-brand-forest text-white hover:bg-brand-dark"
            >
              {approveMutation.isPending
                ? "Đang phê duyệt..."
                : "Xác nhận trừ kho"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Từ chối phiếu xuất hủy</DialogTitle>
            <DialogDescription>
              Nhập lý do từ chối cho lô{" "}
              <span className="font-semibold text-gray-900 tabular-nums">
                {wasteLog.batch.batchCode}
              </span>
              . Tồn kho lô hàng sẽ được giữ nguyên.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {rejectFormError ? (
              <Alert variant="destructive">
                <AlertCircle className="size-4" aria-hidden="true" />
                <AlertDescription>{rejectFormError}</AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="waste-rejection-reason">
                  Lý do từ chối <span className="text-destructive">*</span>
                </Label>
                <span className="text-xs text-gray-500 tabular-nums">
                  {rejectionReason.trim().length}/{REJECTION_REASON_MAX_LENGTH}
                </span>
              </div>
              <Textarea
                id="waste-rejection-reason"
                value={rejectionReason}
                onChange={(event) => {
                  setRejectionReason(event.target.value);
                  if (rejectFormError) {
                    setRejectFormError(null);
                  }
                }}
                rows={4}
                maxLength={REJECTION_REASON_MAX_LENGTH}
                placeholder="Ví dụ: Ảnh cân đo chưa rõ khối lượng thực tế hoặc thiếu tem mã lô."
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRejectDialogOpen(false)}
              disabled={rejectMutation.isPending}
            >
              Hủy
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={rejectMutation.isPending}
              onClick={handleSubmitReject}
            >
              {rejectMutation.isPending ? "Đang gửi..." : "Xác nhận từ chối"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

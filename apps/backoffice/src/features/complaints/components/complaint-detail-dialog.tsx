import {
  ComplaintStatus,
  PAYMENT_METHOD_LABELS,
  type UserRole,
} from "@greenroots/shared";
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
  Skeleton,
  Textarea,
} from "@greenroots/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ImageOff,
  ShieldAlert,
  VideoOff,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import {
  COMPLAINTS_QUERY_KEYS,
  fetchComplaintOrderDetail,
  triageComplaint,
} from "../complaints.api";
import {
  buildTriagePayload,
  COMPLAINT_CATEGORY_LABELS,
  COMPLAINT_NOTE_MAX_LENGTH,
  COMPLAINT_REFUND_CHANNEL_LABELS,
  COMPLAINT_RESOLUTION_LABELS,
  COMPLAINT_STATUS_META,
  evaluateResolveGuard,
  evaluateTriageGuard,
  filterSafeMediaUrls,
  formatViDateTime,
  formatVnd,
  isSafeMediaUrl,
  type StaffComplaintDto,
} from "../complaints.utils";
import { ComplaintResolutionDialog } from "./complaint-resolution-dialog";

interface ComplaintDetailDialogProps {
  readonly complaint: StaffComplaintDto | null;
  readonly open: boolean;
  readonly userRole: UserRole | null | undefined;
  readonly onOpenChange: (open: boolean) => void;
  readonly onUpdated: (message: string) => void;
}

/**
 * Detail dialog for inspecting a customer complaint, viewing validated proof
 * images/video, performing Sales/Admin triage, and launching Admin resolution.
 */
export function ComplaintDetailDialog({
  complaint,
  open,
  userRole,
  onOpenChange,
  onUpdated,
}: ComplaintDetailDialogProps) {
  const queryClient = useQueryClient();

  const [triageNote, setTriageNote] = useState("");
  const [triageError, setTriageError] = useState<string | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [resolveOpen, setResolveOpen] = useState(false);

  const orderDetailQuery = useQuery({
    queryKey: COMPLAINTS_QUERY_KEYS.orderDetail(complaint?.orderId ?? ""),
    queryFn: () => fetchComplaintOrderDetail(complaint?.orderId ?? ""),
    enabled: open && Boolean(complaint?.orderId),
  });

  const triageMutation = useMutation({
    mutationFn: (input: {
      complaintId: string;
      status: "triaged" | "rejected";
      triageNote?: string | null;
    }) =>
      triageComplaint(input.complaintId, {
        status: input.status,
        ...(input.triageNote !== undefined
          ? { triageNote: input.triageNote }
          : {}),
      }),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({
        queryKey: COMPLAINTS_QUERY_KEYS.all,
      });
      onOpenChange(false);
      onUpdated(
        updated.status === ComplaintStatus.TRIAGED
          ? `Đã tiếp nhận khiếu nại đơn ${updated.orderCode} để Admin xử lý bồi hoàn.`
          : `Đã từ chối khiếu nại đơn ${updated.orderCode}.`,
      );
    },
    onError: (err) => {
      setTriageError(
        err instanceof Error
          ? err.message
          : "Không thể cập nhật trạng thái phân loại khiếu nại.",
      );
    },
  });

  if (!complaint) {
    return null;
  }

  const statusMeta = COMPLAINT_STATUS_META[complaint.status];
  const triageGuard = evaluateTriageGuard(complaint.status, userRole);
  const resolveGuard = evaluateResolveGuard(complaint.status, userRole);

  const safeImageUrls = filterSafeMediaUrls(complaint.proofImageUrls);
  const skippedImagesCount =
    complaint.proofImageUrls.length - safeImageUrls.length;
  const activeImageUrl = safeImageUrls[activeImageIndex] ?? safeImageUrls[0];

  const hasVideo = Boolean(complaint.proofVideoUrl);
  const safeVideoUrl = isSafeMediaUrl(complaint.proofVideoUrl)
    ? complaint.proofVideoUrl
    : null;

  const affectedItemIds = new Set(complaint.affectedOrderItemIds);
  const affectedItems =
    orderDetailQuery.data?.items.filter(
      (item) => affectedItemIds.size === 0 || affectedItemIds.has(item.id),
    ) ?? [];

  function handleTriageSubmit(targetStatus: "triaged" | "rejected") {
    if (!complaint) {
      return;
    }
    const built = buildTriagePayload(targetStatus, triageNote);
    if (!built.ok) {
      setTriageError(built.error);
      return;
    }
    setTriageError(null);
    triageMutation.mutate({
      complaintId: complaint.id,
      status: built.payload.status,
      triageNote: built.payload.triageNote,
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle>
                Chi tiết khiếu nại{" "}
                <span className="tabular-nums">{complaint.orderCode}</span>
              </DialogTitle>
              <Badge variant="outline" className={statusMeta.badgeClassName}>
                {statusMeta.label}
              </Badge>
            </div>
            <DialogDescription>
              {COMPLAINT_CATEGORY_LABELS[complaint.category]} · Gửi lúc{" "}
              <span className="tabular-nums">
                {formatViDateTime(complaint.createdAt)}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="divide-y divide-border-subtle text-sm">
            {/* Order & Customer Summary */}
            <div className="grid grid-cols-1 gap-4 py-4 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-gray-500 uppercase">
                  Khách hàng
                </p>
                <p className="font-semibold text-gray-900">
                  {complaint.customerName}
                </p>
                <p className="text-xs text-gray-600 tabular-nums">
                  {complaint.customerPhone ?? "Chưa cập nhật SĐT"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-gray-500 uppercase">
                  Thông tin đơn hàng
                </p>
                <p className="font-semibold text-gray-900 tabular-nums">
                  {complaint.orderCode} · {formatVnd(complaint.orderTotalVnd)}
                </p>
                <p className="text-xs text-gray-600">
                  {PAYMENT_METHOD_LABELS[complaint.orderPaymentMethod]} · Giao{" "}
                  <span className="tabular-nums">
                    {formatViDateTime(complaint.orderDeliveredAt)}
                  </span>
                </p>
              </div>
            </div>

            {/* Customer Note & Affected Items */}
            <div className="space-y-3 py-4">
              <div>
                <p className="mb-1 text-xs font-semibold text-gray-500 uppercase">
                  Mô tả của khách hàng
                </p>
                <p className="leading-relaxed text-gray-800">
                  {complaint.reason}
                </p>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold text-gray-500 uppercase">
                  Sản phẩm liên quan
                </p>
                {orderDetailQuery.isLoading ? (
                  <Skeleton className="h-8 w-full" />
                ) : affectedItems.length > 0 ? (
                  <ul className="space-y-1 text-xs text-gray-700">
                    {affectedItems.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between"
                      >
                        <span>
                          {item.productName}{" "}
                          <span className="text-gray-500 tabular-nums">
                            ({item.quantity} {item.unit})
                          </span>
                        </span>
                        <span className="font-medium tabular-nums">
                          {formatVnd(item.lineTotalVnd)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-gray-500 tabular-nums">
                    {complaint.affectedOrderItemIds.length} dòng sản phẩm được
                    đánh dấu trong đơn gốc.
                  </p>
                )}
              </div>
            </div>

            {/* Proof Media Viewer */}
            <div className="space-y-3 py-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 uppercase">
                  Hình ảnh &amp; Video đối chiếu (
                  <span className="tabular-nums">{safeImageUrls.length}</span>{" "}
                  ảnh{safeVideoUrl ? ", 1 video" : ""})
                </p>
                {activeImageUrl ? (
                  <a
                    href={activeImageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand-forest hover:underline"
                  >
                    Mở ảnh gốc
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </a>
                ) : null}
              </div>

              {skippedImagesCount > 0 ? (
                <Alert variant="destructive">
                  <AlertTriangle className="size-4" aria-hidden="true" />
                  <AlertDescription>
                    Đã ẩn{" "}
                    <span className="tabular-nums">{skippedImagesCount}</span>{" "}
                    liên kết ảnh không hợp lệ (chỉ chấp nhận URL HTTP/HTTPS).
                  </AlertDescription>
                </Alert>
              ) : null}

              {safeImageUrls.length > 0 && activeImageUrl ? (
                <div className="space-y-2">
                  <div className="overflow-hidden rounded-lg bg-gray-100">
                    <img
                      src={activeImageUrl}
                      alt={`Ảnh bằng chứng khiếu nại đơn ${complaint.orderCode}`}
                      className="max-h-72 w-full object-contain"
                    />
                  </div>
                  {safeImageUrls.length > 1 ? (
                    <div className="flex flex-wrap gap-2">
                      {safeImageUrls.map((url, index) => (
                        <Button
                          key={url}
                          type="button"
                          variant={
                            index === activeImageIndex ? "default" : "outline"
                          }
                          size="sm"
                          onClick={() => setActiveImageIndex(index)}
                          className="h-auto p-1"
                          aria-label={`Xem ảnh bằng chứng ${index + 1}`}
                        >
                          <img
                            src={url}
                            alt={`Thu nhỏ ${index + 1}`}
                            className="size-12 rounded object-cover"
                          />
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="flex items-center gap-2 py-3 text-xs text-gray-500">
                  <ImageOff className="size-4" aria-hidden="true" />
                  <span>Không có ảnh bằng chứng hợp lệ.</span>
                </div>
              )}

              {hasVideo ? (
                safeVideoUrl ? (
                  <div className="space-y-1.5 pt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-700">
                        Video đối chiếu tem QR
                      </span>
                      <a
                        href={safeVideoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-brand-forest hover:underline"
                      >
                        Mở video
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                      </a>
                    </div>
                    <video
                      src={safeVideoUrl}
                      controls
                      preload="metadata"
                      className="max-h-64 w-full rounded-lg bg-black"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 pt-2 text-xs text-red-700">
                    <VideoOff className="size-4" aria-hidden="true" />
                    <span>Liên kết video không hợp lệ và đã bị chặn.</span>
                  </div>
                )
              ) : null}
            </div>

            {/* Triage & Resolution Audit History */}
            {complaint.triagedAt || complaint.resolvedAt ? (
              <div className="space-y-2 py-4">
                <p className="text-xs font-semibold text-gray-500 uppercase">
                  Lịch sử xử lý
                </p>
                {complaint.triagedAt ? (
                  <div className="text-xs text-gray-700">
                    <span className="font-semibold">Phân loại:</span>{" "}
                    <span className="tabular-nums">
                      {formatViDateTime(complaint.triagedAt)}
                    </span>
                    {complaint.triageNote ? ` — ${complaint.triageNote}` : ""}
                  </div>
                ) : null}
                {complaint.resolvedAt ? (
                  <div className="space-y-1 text-xs text-gray-700">
                    <div>
                      <span className="font-semibold">Phương án:</span>{" "}
                      {complaint.resolution
                        ? COMPLAINT_RESOLUTION_LABELS[complaint.resolution]
                        : "—"}
                      {complaint.refundChannel
                        ? ` (${COMPLAINT_REFUND_CHANNEL_LABELS[complaint.refundChannel]})`
                        : ""}
                      {complaint.refundAmountVnd !== null
                        ? ` · ${formatVnd(complaint.refundAmountVnd)}`
                        : ""}
                    </div>
                    {complaint.replacementOrderId ? (
                      <div className="tabular-nums">
                        <span className="font-semibold">Mã đơn bù:</span>{" "}
                        {complaint.replacementOrderId}
                      </div>
                    ) : null}
                    {complaint.resolutionNote ? (
                      <div>
                        <span className="font-semibold">Ghi chú:</span>{" "}
                        {complaint.resolutionNote}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Triage Action Form (Pending or Admin Override on Triaged) */}
            {triageGuard.canTriage || triageGuard.canReject ? (
              <div className="space-y-3 py-4">
                <Label htmlFor="triage-note">
                  {triageGuard.isOverrideMode
                    ? "Lý do từ chối ghi đè (bắt buộc 5–500 ký tự)"
                    : `Ghi chú phân loại (bắt buộc tối thiểu 5 ký tự nếu từ chối, tối đa ${COMPLAINT_NOTE_MAX_LENGTH} ký tự)`}
                </Label>
                <Textarea
                  id="triage-note"
                  rows={3}
                  maxLength={COMPLAINT_NOTE_MAX_LENGTH}
                  value={triageNote}
                  onChange={(event) => {
                    setTriageNote(event.target.value);
                    if (triageError) setTriageError(null);
                  }}
                  placeholder="Nhập ghi chú đối chiếu ảnh/video hoặc lý do từ chối..."
                />
                {triageError ? (
                  <Alert variant="destructive">
                    <AlertTriangle className="size-4" aria-hidden="true" />
                    <AlertTitle>Không thể phân loại khiếu nại</AlertTitle>
                    <AlertDescription>{triageError}</AlertDescription>
                  </Alert>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  {triageGuard.canTriage ? (
                    <Button
                      type="button"
                      disabled={triageMutation.isPending}
                      onClick={() => handleTriageSubmit("triaged")}
                    >
                      <CheckCircle2 className="size-4" aria-hidden="true" />
                      Tiếp nhận chuyển Admin xử lý
                    </Button>
                  ) : null}
                  {triageGuard.canReject ? (
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={triageMutation.isPending}
                      onClick={() => handleTriageSubmit("rejected")}
                    >
                      <XCircle className="size-4" aria-hidden="true" />
                      {triageGuard.isOverrideMode
                        ? "Ghi đè từ chối khiếu nại"
                        : "Từ chối khiếu nại"}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* RBAC Notice for Sales on Triaged Complaints */}
            {complaint.status === ComplaintStatus.TRIAGED &&
            !resolveGuard.canResolve &&
            resolveGuard.reason ? (
              <div className="py-4">
                <Alert>
                  <ShieldAlert className="size-4" aria-hidden="true" />
                  <AlertTitle>Giới hạn quyền xử lý bồi hoàn</AlertTitle>
                  <AlertDescription>{resolveGuard.reason}</AlertDescription>
                </Alert>
              </div>
            ) : null}
          </div>

          <DialogFooter className="gap-2">
            {complaint.status === ComplaintStatus.TRIAGED ? (
              <Button
                type="button"
                disabled={!resolveGuard.canResolve}
                onClick={() => setResolveOpen(true)}
              >
                Xử lý hoàn tiền / Tạo đơn bù 0đ
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ComplaintResolutionDialog
        key={complaint.id}
        complaint={complaint}
        orderDetail={orderDetailQuery.data ?? null}
        open={resolveOpen}
        onOpenChange={setResolveOpen}
        onResolved={(updated) => {
          onOpenChange(false);
          onUpdated(
            updated.resolution === "refund"
              ? `Đã hoàn ${formatVnd(updated.refundAmountVnd ?? updated.orderTotalVnd)} cho đơn ${updated.orderCode}.`
              : `Đã tạo đơn bù 0đ cho khiếu nại đơn ${updated.orderCode}.`,
          );
        }}
      />
    </>
  );
}

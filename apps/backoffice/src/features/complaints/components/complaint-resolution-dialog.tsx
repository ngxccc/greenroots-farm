import {
  ComplaintRefundChannel,
  ComplaintResolution,
} from "@greenroots/shared";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@greenroots/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, RefreshCw, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { COMPLAINTS_QUERY_KEYS, resolveComplaint } from "../complaints.api";
import {
  buildResolvePayload,
  COMPLAINT_NOTE_MAX_LENGTH,
  COMPLAINT_REFUND_CHANNEL_LABELS,
  COMPLAINT_RESOLUTION_LABELS,
  formatVnd,
  REFUND_REFERENCE_MAX_LENGTH,
  type ComplaintOrderDetailDto,
  type StaffComplaintDto,
} from "../complaints.utils";

interface ComplaintResolutionDialogProps {
  readonly complaint: StaffComplaintDto | null;
  readonly orderDetail: ComplaintOrderDetailDto | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onResolved: (updated: StaffComplaintDto) => void;
}

/**
 * Admin-only modal for resolving a triaged complaint via dual-channel refund
 * (`bank_transfer` ledger or `loyalty_points` credit) or a `0đ` FEFO replacement order.
 */
export function ComplaintResolutionDialog({
  complaint,
  orderDetail,
  open,
  onOpenChange,
  onResolved,
}: ComplaintResolutionDialogProps) {
  const queryClient = useQueryClient();

  const [resolution, setResolution] = useState<ComplaintResolution>(
    ComplaintResolution.REFUND,
  );
  const [refundChannel, setRefundChannel] = useState<ComplaintRefundChannel>(
    ComplaintRefundChannel.BANK_TRANSFER,
  );
  const [refundAmountText, setRefundAmountText] = useState<string>(() =>
    complaint ? String(complaint.orderTotalVnd) : "",
  );
  const [referenceCode, setReferenceCode] = useState("");
  const [replacementMode, setReplacementMode] = useState<"full" | "partial">(
    "full",
  );
  const [selectedQuantities, setSelectedQuantities] = useState<
    Record<string, number>
  >(() => {
    if (!complaint || !orderDetail) {
      return {};
    }
    const affectedSet = new Set(complaint.affectedOrderItemIds);
    const initial: Record<string, number> = {};
    for (const item of orderDetail.items) {
      if (affectedSet.size === 0 || affectedSet.has(item.id)) {
        initial[item.productId] = item.quantity;
      }
    }
    return initial;
  });
  const [resolutionNote, setResolutionNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const resolveMutation = useMutation({
    mutationFn: (input: {
      complaintId: string;
      payload: Parameters<typeof resolveComplaint>[1];
    }) =>
      resolveComplaint(input.complaintId, input.payload, crypto.randomUUID()),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({
        queryKey: COMPLAINTS_QUERY_KEYS.all,
      });
      onOpenChange(false);
      onResolved(updated);
    },
    onError: (err) => {
      setFormError(
        err instanceof Error
          ? err.message
          : "Không thể xử lý bồi hoàn cho khiếu nại.",
      );
    },
  });

  const orderItems = useMemo(() => orderDetail?.items ?? [], [orderDetail]);

  if (!complaint) {
    return null;
  }

  function handleSubmit() {
    if (!complaint) {
      return;
    }

    if (resolution === ComplaintResolution.REFUND) {
      const parsedAmount = Number(refundAmountText.replace(/[^\d]/g, ""));
      const built = buildResolvePayload({
        resolution: ComplaintResolution.REFUND,
        refundChannel,
        refundAmountVnd: parsedAmount,
        orderTotalVnd: complaint.orderTotalVnd,
        referenceCode,
        resolutionNote,
      });
      if (!built.ok) {
        setFormError(built.error);
        return;
      }
      setFormError(null);
      resolveMutation.mutate({
        complaintId: complaint.id,
        payload: built.payload,
      });
      return;
    }

    const partialItems = orderItems
      .filter((item) => (selectedQuantities[item.productId] ?? 0) > 0)
      .map((item) => ({
        productId: item.productId,
        quantity: selectedQuantities[item.productId] ?? 0,
        maxQuantity: item.quantity,
      }));

    const built = buildResolvePayload({
      resolution: ComplaintResolution.REPLACEMENT,
      mode: orderItems.length > 0 ? replacementMode : "full",
      items: partialItems,
      resolutionNote,
    });

    if (!built.ok) {
      setFormError(built.error);
      return;
    }

    setFormError(null);
    resolveMutation.mutate({
      complaintId: complaint.id,
      payload: built.payload,
    });
  }

  const activeChannelLabel = COMPLAINT_REFUND_CHANNEL_LABELS[refundChannel];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Xử lý bồi hoàn đơn{" "}
            <span className="tabular-nums">{complaint.orderCode}</span>
          </DialogTitle>
          <DialogDescription>
            Chọn phương án hoàn tiền hoặc tạo đơn giao bù 0đ theo tồn kho FEFO.
            Thao tác này có tính bất biến và không thể hoàn tác.
          </DialogDescription>
        </DialogHeader>

        <div className="divide-y divide-border-subtle text-sm">
          <div className="flex items-center justify-between py-3">
            <span className="text-gray-600">Khách hàng</span>
            <span className="font-semibold text-gray-900">
              {complaint.customerName}
            </span>
          </div>
          <div className="flex items-center justify-between py-3">
            <span className="text-gray-600">Giá trị đơn hàng gốc</span>
            <span className="font-bold text-gray-900 tabular-nums">
              {formatVnd(complaint.orderTotalVnd)}
            </span>
          </div>

          <div className="space-y-3 py-4">
            <p className="text-sm font-semibold text-gray-900">
              Hình thức xử lý
            </p>
            <RadioGroup
              value={resolution}
              onValueChange={(value) => {
                setResolution(value as ComplaintResolution);
                setFormError(null);
              }}
              className="grid grid-cols-1 gap-2 sm:grid-cols-2"
            >
              <Label
                htmlFor="resolution-refund"
                className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border-subtle bg-surface-card p-3 font-medium text-gray-900"
              >
                <RadioGroupItem
                  id="resolution-refund"
                  value={ComplaintResolution.REFUND}
                />
                <Wallet
                  className="size-4 text-brand-forest"
                  aria-hidden="true"
                />
                <span>
                  {COMPLAINT_RESOLUTION_LABELS[ComplaintResolution.REFUND]}
                </span>
              </Label>
              <Label
                htmlFor="resolution-replacement"
                className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border-subtle bg-surface-card p-3 font-medium text-gray-900"
              >
                <RadioGroupItem
                  id="resolution-replacement"
                  value={ComplaintResolution.REPLACEMENT}
                />
                <RefreshCw
                  className="size-4 text-brand-forest"
                  aria-hidden="true"
                />
                <span>
                  {COMPLAINT_RESOLUTION_LABELS[ComplaintResolution.REPLACEMENT]}
                </span>
              </Label>
            </RadioGroup>
          </div>

          {resolution === ComplaintResolution.REFUND ? (
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="refund-channel">Kênh hoàn tiền</Label>
                <Select
                  value={refundChannel}
                  onValueChange={(value) => {
                    if (value) {
                      setRefundChannel(value);
                    }
                  }}
                >
                  <SelectTrigger
                    id="refund-channel"
                    aria-label="Chọn kênh hoàn tiền"
                  >
                    <SelectValue>{activeChannelLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ComplaintRefundChannel.BANK_TRANSFER}>
                      {
                        COMPLAINT_REFUND_CHANNEL_LABELS[
                          ComplaintRefundChannel.BANK_TRANSFER
                        ]
                      }
                    </SelectItem>
                    <SelectItem value={ComplaintRefundChannel.LOYALTY_POINTS}>
                      {
                        COMPLAINT_REFUND_CHANNEL_LABELS[
                          ComplaintRefundChannel.LOYALTY_POINTS
                        ]
                      }
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="refund-amount">
                  Số tiền hoàn (VNĐ, tối đa{" "}
                  <span className="tabular-nums">
                    {formatVnd(complaint.orderTotalVnd)}
                  </span>
                  )
                </Label>
                <Input
                  id="refund-amount"
                  type="number"
                  min={1}
                  max={complaint.orderTotalVnd}
                  step={1000}
                  value={refundAmountText}
                  onChange={(event) => setRefundAmountText(event.target.value)}
                  className="tabular-nums"
                />
              </div>

              {refundChannel === ComplaintRefundChannel.BANK_TRANSFER ? (
                <div className="space-y-1.5">
                  <Label htmlFor="refund-reference">
                    Mã tham chiếu chuyển khoản (tùy chọn)
                  </Label>
                  <Input
                    id="refund-reference"
                    type="text"
                    maxLength={REFUND_REFERENCE_MAX_LENGTH}
                    value={referenceCode}
                    onChange={(event) => setReferenceCode(event.target.value)}
                    placeholder="Ví dụ: VCB-20261128-001"
                    className="tabular-nums"
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4 py-4">
              {orderItems.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-gray-900">
                    Phạm vi đơn bù 0đ
                  </p>
                  <RadioGroup
                    value={replacementMode}
                    onValueChange={(value) =>
                      setReplacementMode(value as "full" | "partial")
                    }
                    className="space-y-2"
                  >
                    <Label
                      htmlFor="replace-full"
                      className="flex cursor-pointer items-center gap-2 font-normal text-gray-800"
                    >
                      <RadioGroupItem id="replace-full" value="full" />
                      <span>Bù toàn bộ sản phẩm từ đơn gốc (0đ)</span>
                    </Label>
                    <Label
                      htmlFor="replace-partial"
                      className="flex cursor-pointer items-center gap-2 font-normal text-gray-800"
                    >
                      <RadioGroupItem id="replace-partial" value="partial" />
                      <span>Chọn một phần sản phẩm bị ảnh hưởng</span>
                    </Label>
                  </RadioGroup>

                  {replacementMode === "partial" ? (
                    <div className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
                      {orderItems.map((item) => {
                        const currentQty =
                          selectedQuantities[item.productId] ?? 0;
                        const isChecked = currentQty > 0;
                        return (
                          <div
                            key={item.id}
                            className="flex items-center justify-between gap-3 px-3 py-2.5"
                          >
                            <Label
                              htmlFor={`replace-item-${item.id}`}
                              className="flex flex-1 cursor-pointer items-center gap-2.5 font-normal"
                            >
                              <Checkbox
                                id={`replace-item-${item.id}`}
                                checked={isChecked}
                                onCheckedChange={(checked) => {
                                  setSelectedQuantities((prev) => ({
                                    ...prev,
                                    [item.productId]: checked
                                      ? item.quantity
                                      : 0,
                                  }));
                                }}
                              />
                              <span className="text-sm text-gray-900">
                                {item.productName}{" "}
                                <span className="text-xs text-gray-500 tabular-nums">
                                  (Đơn gốc: {item.quantity} {item.unit})
                                </span>
                              </span>
                            </Label>
                            {isChecked ? (
                              <Input
                                type="number"
                                min={0.01}
                                max={item.quantity}
                                step="any"
                                aria-label={`Số lượng bù cho ${item.productName}`}
                                value={currentQty}
                                onChange={(event) => {
                                  const next = Number(event.target.value);
                                  setSelectedQuantities((prev) => ({
                                    ...prev,
                                    [item.productId]: Number.isFinite(next)
                                      ? next
                                      : 0,
                                  }));
                                }}
                                className="w-24 text-right tabular-nums"
                              />
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ) : (
                <Alert>
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  <AlertDescription>
                    Hệ thống sẽ tự động tạo đơn giao bù 0đ sao chép toàn bộ sản
                    phẩm từ đơn gốc và phân bổ lô theo chuẩn FEFO.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <div className="space-y-1.5 py-4">
            <Label htmlFor="resolution-note">
              Ghi chú xử lý nội bộ (tùy chọn, tối đa {COMPLAINT_NOTE_MAX_LENGTH}{" "}
              ký tự)
            </Label>
            <Textarea
              id="resolution-note"
              rows={3}
              maxLength={COMPLAINT_NOTE_MAX_LENGTH}
              value={resolutionNote}
              onChange={(event) => setResolutionNote(event.target.value)}
              placeholder="Ghi nhận phương án đã thống nhất với khách hàng..."
            />
          </div>
        </div>

        {formError ? (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" aria-hidden="true" />
            <AlertTitle>Dữ liệu xử lý chưa hợp lệ</AlertTitle>
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={resolveMutation.isPending}
            onClick={() => onOpenChange(false)}
          >
            Hủy
          </Button>
          <Button
            type="button"
            disabled={resolveMutation.isPending}
            onClick={handleSubmit}
          >
            {resolveMutation.isPending
              ? "Đang xử lý..."
              : resolution === ComplaintResolution.REFUND
                ? "Xác nhận hoàn tiền"
                : "Tạo đơn bù 0đ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { BatchStatus } from "@greenroots/shared";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  cn,
} from "@greenroots/ui";
import { AlertCircle, CheckCircle2, ImagePlus, Trash2 } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type SyntheticEvent,
} from "react";
import {
  createSafeBlobPreviewUrl,
  uploadSignedMedia,
  validateMediaFile,
} from "@/lib/cloudinary-upload";
import {
  WASTE_LOG_MAX_MEDIA_ITEMS,
  WASTE_LOG_REASON_MAX_LENGTH,
  WASTE_LOG_STATUS_META,
  computeRemainingWasteAllowance,
  formatVietnamDateTime,
  validateWasteProposalInput,
  type BatchDto,
  type CreateWasteLogDto,
  type WasteLogDto,
} from "../batches.utils";

interface PendingProofImage {
  readonly id: string;
  readonly file: File;
  readonly previewUrl: string;
}

interface WasteProposalTabProps {
  readonly batches: readonly BatchDto[];
  readonly wasteLogs: readonly WasteLogDto[];
  readonly selectedBatchId: string;
  readonly onSelectedBatchIdChange: (batchId: string) => void;
  readonly isPending: boolean;
  readonly onSubmit: (
    payload: CreateWasteLogDto,
    idempotencyKey: string,
  ) => Promise<void>;
}

/**
 * Tab panel for submitting waste write-off proposals with deferred Cloudinary proof uploads.
 */
export function WasteProposalTab({
  batches,
  wasteLogs,
  selectedBatchId,
  onSelectedBatchIdChange,
  isPending,
  onSubmit,
}: WasteProposalTabProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [discardedQuantity, setDiscardedQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [pendingImages, setPendingImages] = useState<PendingProofImage[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );

  useEffect(() => {
    return () => {
      for (const item of pendingImages) {
        URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, [pendingImages]);

  const eligibleBatches = batches.filter(
    (batch) =>
      batch.status !== BatchStatus.SOLD_OUT && batch.availableQuantity > 0,
  );

  const selectedBatch = eligibleBatches.find(
    (batch) => batch.id === selectedBatchId,
  );
  const remainingAllowance = selectedBatch
    ? computeRemainingWasteAllowance(selectedBatch, wasteLogs, selectedBatch.id)
    : 0;

  function handleFilesSelected(event: ChangeEvent<HTMLInputElement>): void {
    setFormError(null);
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (files.length === 0) {
      return;
    }

    const availableSlots = WASTE_LOG_MAX_MEDIA_ITEMS - pendingImages.length;
    if (availableSlots <= 0) {
      setFormError(
        `Chỉ được đính kèm tối đa ${WASTE_LOG_MAX_MEDIA_ITEMS} ảnh bằng chứng.`,
      );
      return;
    }

    const nextItems: PendingProofImage[] = [];
    for (const file of files.slice(0, availableSlots)) {
      const validationError = validateMediaFile(file, "image");
      if (validationError) {
        setFormError(validationError);
        continue;
      }
      try {
        nextItems.push({
          id: crypto.randomUUID(),
          file,
          previewUrl: createSafeBlobPreviewUrl(file),
        });
      } catch (error) {
        setFormError(
          error instanceof Error
            ? error.message
            : "Không thể tạo ảnh xem trước.",
        );
      }
    }

    if (nextItems.length > 0) {
      setPendingImages((prev) => [...prev, ...nextItems]);
    }
  }

  function handleRemoveImage(id: string): void {
    setPendingImages((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
  }

  async function handleSubmit(event: SyntheticEvent): Promise<void> {
    event.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    const validation = validateWasteProposalInput({
      batchId: selectedBatchId,
      discardedQuantity: Number(discardedQuantity),
      reason,
      mediaCount: pendingImages.length,
      maxAllowedQuantity: remainingAllowance,
    });

    if (!validation.valid) {
      setFormError(
        validation.error ?? "Dữ liệu đề xuất xuất hủy không hợp lệ.",
      );
      return;
    }

    setIsUploading(true);
    try {
      const uploaded = await Promise.all(
        pendingImages.map((item) =>
          uploadSignedMedia(item.file, "waste_logs", "image"),
        ),
      );
      const mediaUrls = uploaded.map((result) => result.secureUrl);

      await onSubmit(
        {
          batchId: selectedBatchId,
          discardedQuantity: Number(discardedQuantity),
          reason: reason.trim(),
          mediaUrls,
        },
        idempotencyKey,
      );

      for (const item of pendingImages) {
        URL.revokeObjectURL(item.previewUrl);
      }
      setPendingImages([]);
      setDiscardedQuantity("");
      setReason("");
      onSelectedBatchIdChange("");
      setIdempotencyKey(crypto.randomUUID());
      setFormSuccess(
        "Đã gửi phiếu đề xuất xuất hủy thành công. Tồn kho chỉ trừ sau khi Admin phê duyệt.",
      );
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Không thể gửi đề xuất xuất hủy.",
      );
      setIdempotencyKey(crypto.randomUUID());
    } finally {
      setIsUploading(false);
    }
  }

  const submitting = isPending || isUploading;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <Card className="border-border-subtle bg-surface-card lg:col-span-5">
        <CardHeader>
          <CardTitle>Lập đề xuất xuất hủy</CardTitle>
          <CardDescription>
            Chọn lô hàng hư hỏng hoặc quá hạn, nhập số lượng và đính kèm 1–3 ảnh
            bằng chứng để Admin duyệt.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {formError ? (
              <Alert variant="destructive">
                <AlertCircle className="size-4" aria-hidden="true" />
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}

            {formSuccess ? (
              <Alert variant="success">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                <AlertDescription>{formSuccess}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="waste-batch-select">Lô hàng cần xuất hủy</Label>
              <Select
                value={selectedBatchId}
                onValueChange={(value) => {
                  onSelectedBatchIdChange(value ?? "");
                  setFormError(null);
                }}
              >
                <SelectTrigger id="waste-batch-select" className="w-full">
                  <SelectValue placeholder="Chọn lô hàng có tồn kho khả dụng" />
                </SelectTrigger>
                <SelectContent>
                  {eligibleBatches.map((batch) => {
                    const allowance = computeRemainingWasteAllowance(
                      batch,
                      wasteLogs,
                      batch.id,
                    );
                    return (
                      <SelectItem key={batch.id} value={batch.id}>
                        {batch.batchCode} — {batch.product.name} (Còn{" "}
                        {allowance} {batch.product.unit})
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {selectedBatch ? (
                <p className="text-xs text-gray-600 tabular-nums">
                  Khả dụng tối đa cho đề xuất mới: {remainingAllowance}{" "}
                  {selectedBatch.product.unit}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="waste-quantity-input">
                Số lượng đề xuất hủy{" "}
                {selectedBatch ? `(${selectedBatch.product.unit})` : ""}
              </Label>
              <Input
                id="waste-quantity-input"
                type="number"
                min={1}
                step={1}
                max={remainingAllowance > 0 ? remainingAllowance : undefined}
                placeholder="Ví dụ: 5"
                value={discardedQuantity}
                onChange={(event) => setDiscardedQuantity(event.target.value)}
                className="tabular-nums"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="waste-reason-textarea">Lý do xuất hủy</Label>
              <Textarea
                id="waste-reason-textarea"
                rows={3}
                maxLength={WASTE_LOG_REASON_MAX_LENGTH}
                placeholder="Mô tả tình trạng hư hỏng, dập nát hoặc quá hạn sử dụng..."
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required
              />
              <span className="text-right text-xs text-gray-500 tabular-nums">
                {reason.length}/{WASTE_LOG_REASON_MAX_LENGTH}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="waste-proof-input">
                Ảnh bằng chứng (1–{WASTE_LOG_MAX_MEDIA_ITEMS} ảnh)
              </Label>
              <Input
                ref={fileInputRef}
                id="waste-proof-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={handleFilesSelected}
                className="sr-only"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={
                  submitting ||
                  pendingImages.length >= WASTE_LOG_MAX_MEDIA_ITEMS
                }
              >
                <ImagePlus className="size-4" aria-hidden="true" />
                Chọn ảnh bằng chứng ({pendingImages.length}/
                {WASTE_LOG_MAX_MEDIA_ITEMS})
              </Button>

              {pendingImages.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {pendingImages.map((item) => (
                    <div
                      key={item.id}
                      className="relative overflow-hidden rounded-md border border-border-subtle"
                    >
                      <img
                        src={item.previewUrl}
                        alt="Ảnh bằng chứng xuất hủy"
                        className="h-20 w-full object-cover"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        aria-label="Xóa ảnh bằng chứng"
                        onClick={() => handleRemoveImage(item.id)}
                        className="absolute top-1 right-1 bg-surface-card/90"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <Button type="submit" disabled={submitting}>
              {isUploading
                ? "Đang tải ảnh..."
                : isPending
                  ? "Đang gửi đề xuất..."
                  : "Gửi đề xuất xuất hủy"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border-subtle bg-surface-card lg:col-span-7">
        <CardHeader>
          <CardTitle>Phiếu đề xuất hủy gần đây</CardTitle>
          <CardDescription>
            Theo dõi trạng thái phê duyệt. Tồn kho lô hàng chỉ được khấu trừ sau
            khi Admin xác nhận duyệt.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {wasteLogs.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              Chưa có phiếu đề xuất xuất hủy nào.
            </p>
          ) : (
            <div className="divide-y divide-border-subtle">
              {wasteLogs.map((log) => {
                const meta = WASTE_LOG_STATUS_META[log.status];
                return (
                  <div
                    key={log.id}
                    className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900 tabular-nums">
                          {log.batch.batchCode}
                        </span>
                        <span className="text-sm text-gray-600">
                          — {log.batch.productName}
                        </span>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn("font-medium", meta.badgeClassName)}
                      >
                        {meta.label}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600 tabular-nums">
                      <span>
                        Số lượng hủy: {log.discardedQuantity} {log.batch.unit}
                      </span>
                      <span>
                        Tạo lúc: {formatVietnamDateTime(log.createdAt)}
                      </span>
                    </div>

                    <p className="text-sm text-gray-800">{log.reason}</p>

                    {log.rejectionReason ? (
                      <p className="text-xs font-medium text-status-spoiled">
                        Lý do từ chối: {log.rejectionReason}
                      </p>
                    ) : null}

                    {log.mediaUrls.length > 0 ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {log.mediaUrls.map((url, idx) => (
                          <img
                            key={url}
                            src={url}
                            alt={`Bằng chứng ${idx + 1} của lô ${log.batch.batchCode}`}
                            className="h-14 w-16 rounded border border-border-subtle object-cover"
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  BUSINESS_RULES,
  ComplaintCategory,
  ComplaintResolution,
  ComplaintStatus,
} from "@greenroots/shared";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Checkbox,
  Label,
  RadioGroup,
  RadioGroupItem,
  Skeleton,
  Textarea,
} from "@greenroots/ui";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Headset,
  ImagePlus,
  Leaf,
  Lock,
  Send,
  Video,
  X,
  XCircle,
} from "lucide-react";
import { BackLink } from "@/components/common/back-link";
import { formatViDateTime, formatVnd, roundQuantity } from "@/lib/format";
import { isApprovedStorefrontImageUrl } from "@/lib/image-url";
import { submitComplaintAction } from "../actions/complaint-actions";
import {
  COMPLAINT_REASON_MAX_LENGTH,
  COMPLAINT_REASON_MIN_LENGTH,
  type ComplaintDto,
} from "../schemas/complaint.schema";
import type { OrderDto } from "../schemas/order.schema";
import {
  ComplaintMediaUploadError,
  cleanupComplaintMediaFromServer,
  readVideoDurationSeconds,
  uploadComplaintFileToCloudinary,
} from "../utils/complaint-media-upload";
import {
  COMPLAINT_CATEGORY_LABELS,
  COMPLAINT_CATEGORY_OPTIONS,
  COMPLAINT_REFUND_CHANNEL_LABELS,
  COMPLAINT_RESOLUTION_LABELS,
  COMPLAINT_STATUS_LABELS,
  buildComplaintFsmSteps,
  formatRemainingCountdown,
  getComplaintDeadlineMs,
  isComplaintWindowExpired,
  isOrderComplaintEligibleStatus,
  validateComplaintImageFile,
  validateComplaintVideoMetadata,
} from "../utils/complaint.utils";

interface OrderComplaintViewProps {
  readonly order: OrderDto;
  readonly initialComplaint: ComplaintDto | null;
}

interface StagedPhotoItem {
  readonly file: File;
  readonly previewUrl: string;
  readonly name: string;
}

interface StagedVideoItem {
  readonly file: File;
  readonly name: string;
  readonly sizeBytes: number;
}

function OrderItemThumb({
  src,
  alt,
}: {
  readonly src: string | null;
  readonly alt: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const approvedSrc =
    src !== null && isApprovedStorefrontImageUrl(src) ? src : null;
  const showFallback = approvedSrc === null || failedSrc === approvedSrc;

  return (
    <div className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded bg-green-50 text-brand-forest">
      {showFallback ? (
        <Leaf className="size-4" aria-hidden="true" />
      ) : (
        <Image
          src={approvedSrc}
          alt={alt}
          fill
          sizes="44px"
          onError={() => setFailedSrc(approvedSrc)}
          className="object-cover"
        />
      )}
    </div>
  );
}

function ProofImageThumb({
  src,
  alt,
  sizes,
}: {
  readonly src: string;
  readonly alt: string;
  readonly sizes: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const isLocalPreview = src.startsWith("blob:");
  const approvedSrc =
    isLocalPreview || isApprovedStorefrontImageUrl(src) ? src : null;
  const showFallback = approvedSrc === null || failedSrc === approvedSrc;

  if (showFallback) {
    return (
      <div className="flex size-full items-center justify-center bg-green-50 text-brand-forest">
        <ImagePlus className="size-5" aria-hidden="true" />
      </div>
    );
  }

  if (isLocalPreview) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Local blob: preview URL before submit-time Cloudinary upload
      <img
        src={approvedSrc}
        alt={alt}
        onError={() => setFailedSrc(approvedSrc)}
        className="size-full object-cover"
      />
    );
  }

  return (
    <Image
      src={approvedSrc}
      alt={alt}
      fill
      sizes={sizes}
      onError={() => setFailedSrc(approvedSrc)}
      className="object-cover"
    />
  );
}

export function OrderComplaintView({
  order,
  initialComplaint,
}: OrderComplaintViewProps) {
  const router = useRouter();
  const [submittedComplaint, setSubmittedComplaint] =
    useState<ComplaintDto | null>(null);
  const complaint = submittedComplaint ?? initialComplaint;
  const [category, setCategory] = useState<ComplaintCategory>(
    ComplaintCategory.DAMAGED_WILTED,
  );
  const [affectedOrderItemIds, setAffectedOrderItemIds] = useState<string[]>(
    () => (order.items[0] ? [order.items[0].id] : []),
  );
  const [reason, setReason] = useState("");
  const [photos, setPhotos] = useState<StagedPhotoItem[]>([]);
  const [video, setVideo] = useState<StagedVideoItem | null>(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const deadlineMs = getComplaintDeadlineMs(order.deliveredAt);
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    const initTimer = setTimeout(() => {
      setNowMs(Date.now());
    }, 0);
    if (deadlineMs === null || complaint !== null) {
      return () => clearTimeout(initTimer);
    }
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => {
      clearTimeout(initTimer);
      clearInterval(interval);
    };
  }, [deadlineMs, complaint]);

  const isEligibleStatus = isOrderComplaintEligibleStatus(order.orderStatus);
  const isExpired =
    nowMs !== null ? isComplaintWindowExpired(order.deliveredAt, nowMs) : false;
  const remainingMs =
    deadlineMs !== null && nowMs !== null
      ? Math.max(0, deadlineMs - nowMs)
      : null;

  const toggleItem = (itemId: string) => {
    setAffectedOrderItemIds((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId],
    );
  };

  const handlePhotoFilesChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    setMediaError(null);
    const remainingSlots = Math.max(
      0,
      BUSINESS_RULES.COMPLAINT_MAX_IMAGES - photos.length,
    );
    const candidates = files.slice(0, remainingSlots);

    for (const file of candidates) {
      const validationError = validateComplaintImageFile(file);
      if (validationError) {
        setMediaError(validationError);
        return;
      }
    }

    const staged = candidates.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      name: file.name,
    }));
    setPhotos((prev) => [...prev, ...staged]);
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => {
      const target = prev.at(index);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleVideoFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setMediaError(null);
    const durationSeconds = await readVideoDurationSeconds(file);
    const validationError = validateComplaintVideoMetadata({
      size: file.size,
      type: file.type,
      durationSeconds,
    });
    if (validationError) {
      setMediaError(validationError);
      return;
    }

    setVideo({ file, name: file.name, sizeBytes: file.size });
  };

  const handleSubmit = (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setMediaError(null);

    if (isExpired) {
      setFormError(
        `Đã quá thời hạn ${BUSINESS_RULES.COMPLAINT_WINDOW_HOURS} giờ kể từ lúc giao hàng.`,
      );
      return;
    }

    if (affectedOrderItemIds.length === 0) {
      setFormError("Vui lòng chọn ít nhất 1 sản phẩm gặp sự cố.");
      return;
    }

    if (photos.length < BUSINESS_RULES.COMPLAINT_MIN_IMAGES) {
      setFormError("Vui lòng tải lên ít nhất 1 ảnh thực tế.");
      return;
    }

    const trimmedReason = reason.trim();
    if (trimmedReason.length < COMPLAINT_REASON_MIN_LENGTH) {
      setFormError(
        `Vui lòng mô tả chi tiết tối thiểu ${COMPLAINT_REASON_MIN_LENGTH} ký tự.`,
      );
      return;
    }

    startTransition(async () => {
      let uploadedImageUrls: string[] = [];
      let uploadedVideoUrl: string | null = null;

      setIsUploadingMedia(true);
      try {
        uploadedImageUrls = await Promise.all(
          photos.map((photo) =>
            uploadComplaintFileToCloudinary(photo.file, "image"),
          ),
        );
        if (video) {
          uploadedVideoUrl = await uploadComplaintFileToCloudinary(
            video.file,
            "video",
          );
        }
      } catch (error) {
        await cleanupComplaintMediaFromServer(
          uploadedImageUrls,
          uploadedVideoUrl,
        );
        setFormError(
          error instanceof ComplaintMediaUploadError
            ? error.message
            : "Không thể tải tệp minh chứng lên. Vui lòng thử lại.",
        );
        return;
      } finally {
        setIsUploadingMedia(false);
      }

      const result = await submitComplaintAction({
        orderId: order.id,
        category,
        affectedOrderItemIds,
        reason: trimmedReason,
        proofImageUrls: uploadedImageUrls,
        proofVideoUrl: uploadedVideoUrl,
      });

      if (result.ok) {
        for (const photo of photos) {
          URL.revokeObjectURL(photo.previewUrl);
        }
        setSubmittedComplaint(result.complaint);
        return;
      }

      await cleanupComplaintMediaFromServer(
        uploadedImageUrls,
        uploadedVideoUrl,
      );

      if (result.code === "ORDER_COMPLAINT_WINDOW_EXPIRED") {
        setNowMs(Date.now());
      } else if (result.code === "ORDER_COMPLAINT_ALREADY_EXISTS") {
        router.refresh();
      }
      setFormError(result.message);
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-4 pb-10 lg:px-6 lg:pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackLink
          href={`/orders/${order.id}`}
          label="Quay lại chi tiết đơn hàng"
        />
      </div>

      {/* 24h Deadline Banner */}
      <section
        aria-label="Thời hạn khiếu nại"
        className="flex flex-col justify-between gap-4 border-b border-border-subtle pb-4 sm:flex-row sm:items-center"
      >
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-green-50 text-brand-forest">
            <Headset className="size-5" aria-hidden="true" />
          </span>
          <div className="flex flex-col">
            <h1 className="text-lg font-bold text-gray-900 tabular-nums">
              Khiếu nại đơn hàng #{order.orderCode}
            </h1>
            <span className="text-xs text-gray-500 tabular-nums">
              {order.deliveredAt
                ? `Đã giao lúc ${formatViDateTime(order.deliveredAt)}`
                : "Đơn hàng chưa ghi nhận thời điểm giao"}
            </span>
          </div>
        </div>

        {order.deliveredAt ? (
          <div className="inline-flex items-center gap-2.5 self-start rounded-lg bg-surface-warm px-4 py-2 sm:self-center">
            {isExpired && !complaint ? (
              <Lock className="size-4 text-status-spoiled" aria-hidden="true" />
            ) : (
              <Clock className="size-4 text-brand-forest" aria-hidden="true" />
            )}
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold text-gray-500">
                Hạn gửi khiếu nại ({BUSINESS_RULES.COMPLAINT_WINDOW_HOURS}h)
              </span>
              <span className="text-sm font-semibold text-gray-900 tabular-nums">
                {complaint
                  ? `Trước ${formatViDateTime(new Date(deadlineMs!).toISOString())}`
                  : isExpired
                    ? "Đã hết thời hạn 24h"
                    : remainingMs !== null
                      ? `Còn ${formatRemainingCountdown(remainingMs)}`
                      : `Trước ${formatViDateTime(new Date(deadlineMs!).toISOString())}`}
              </span>
            </div>
          </div>
        ) : null}
      </section>

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-8">
          {complaint ? (
            /* STATUS & RESOLUTION VIEW */
            <section
              aria-label="Trạng thái xử lý khiếu nại"
              className="flex flex-col gap-6"
            >
              <div className="flex flex-col justify-between gap-2 border-b border-border-subtle pb-4 sm:flex-row sm:items-center">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-gray-900">
                      Trạng thái khiếu nại
                    </h2>
                    <Badge
                      variant={
                        complaint.status === ComplaintStatus.REJECTED
                          ? "destructive"
                          : "default"
                      }
                    >
                      {COMPLAINT_STATUS_LABELS[complaint.status]}
                    </Badge>
                  </div>
                  <span className="text-xs text-gray-500 tabular-nums">
                    Gửi lúc {formatViDateTime(complaint.createdAt)} — Đơn hàng #
                    {order.orderCode}
                  </span>
                </div>
              </div>

              {/* 3-Step FSM Timeline */}
              <div className="flex flex-col divide-y divide-border-subtle border-b border-border-subtle">
                {buildComplaintFsmSteps(complaint).map((step) => (
                  <div
                    key={step.key}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div className="flex items-center gap-2">
                      {step.state === "completed" ? (
                        <CheckCircle2
                          className="size-4 shrink-0 text-brand-forest"
                          aria-hidden="true"
                        />
                      ) : step.state === "rejected" ? (
                        <XCircle
                          className="size-4 shrink-0 text-status-spoiled"
                          aria-hidden="true"
                        />
                      ) : step.state === "current" ? (
                        <Clock
                          className="size-4 shrink-0 text-brand-dark"
                          aria-hidden="true"
                        />
                      ) : (
                        <Clock
                          className="size-4 shrink-0 text-gray-400"
                          aria-hidden="true"
                        />
                      )}
                      <span
                        className={
                          step.state === "upcoming"
                            ? "text-sm font-medium text-gray-400"
                            : step.state === "rejected"
                              ? "text-sm font-semibold text-status-spoiled"
                              : "text-sm font-semibold text-gray-900"
                        }
                      >
                        {step.label}
                      </span>
                    </div>
                    {step.detail ? (
                      <span className="text-right text-xs text-gray-500 tabular-nums">
                        {step.key === "received"
                          ? formatViDateTime(step.detail)
                          : step.detail}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>

              {/* Resolution Details */}
              {complaint.status === ComplaintStatus.APPROVED &&
              complaint.resolution ? (
                <Alert variant="success">
                  <AlertTitle>
                    Phương án xử lý:{" "}
                    {COMPLAINT_RESOLUTION_LABELS[complaint.resolution]}
                  </AlertTitle>
                  <AlertDescription className="space-y-1">
                    {complaint.resolution === ComplaintResolution.REFUND &&
                    complaint.refundAmountVnd ? (
                      <p className="tabular-nums">
                        Số tiền hoàn:{" "}
                        <strong>{formatVnd(complaint.refundAmountVnd)}</strong>
                        {complaint.refundChannel
                          ? ` (${COMPLAINT_REFUND_CHANNEL_LABELS[complaint.refundChannel]})`
                          : ""}
                      </p>
                    ) : null}
                    {complaint.resolution === ComplaintResolution.REPLACEMENT &&
                    complaint.replacementOrderId ? (
                      <p>
                        Đơn giao bù:{" "}
                        <Link
                          href={`/orders/${complaint.replacementOrderId}`}
                          className="font-semibold text-brand-forest underline"
                        >
                          Xem đơn giao bù
                        </Link>
                      </p>
                    ) : null}
                    {complaint.resolutionNote ? (
                      <p>Ghi chú: {complaint.resolutionNote}</p>
                    ) : null}
                  </AlertDescription>
                </Alert>
              ) : null}

              {complaint.status === ComplaintStatus.REJECTED &&
              complaint.triageNote ? (
                <Alert variant="destructive">
                  <AlertTitle>Lý do từ chối</AlertTitle>
                  <AlertDescription>{complaint.triageNote}</AlertDescription>
                </Alert>
              ) : null}

              {/* Submitted Evidence Summary */}
              <div className="flex flex-col gap-3 rounded-lg bg-surface-warm p-4">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold text-gray-500">
                    Phân loại
                  </span>
                  <span className="text-sm font-semibold text-gray-900">
                    {COMPLAINT_CATEGORY_LABELS[complaint.category]}
                  </span>
                </div>

                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold text-gray-500">
                    Mô tả đã gửi
                  </span>
                  <p className="text-sm text-pretty text-gray-800">
                    {complaint.reason}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {complaint.proofImageUrls.map((url, idx) => (
                    <div
                      key={url}
                      className="relative size-16 overflow-hidden rounded border border-border-subtle bg-white"
                    >
                      <ProofImageThumb
                        src={url}
                        alt={`Bằng chứng ảnh ${idx + 1}`}
                        sizes="64px"
                      />
                    </div>
                  ))}
                  {complaint.proofVideoUrl ? (
                    <a
                      href={complaint.proofVideoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded border border-border-subtle bg-white px-3 py-2 text-xs font-semibold text-brand-dark hover:bg-green-50"
                    >
                      <Video className="size-4" aria-hidden="true" />
                      <span>Xem video đính kèm</span>
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  nativeButton={false}
                  render={<Link href={`/orders/${order.id}`} />}
                >
                  Xem chi tiết đơn hàng
                </Button>
                <Button
                  nativeButton={false}
                  variant="outline"
                  render={<Link href="/account/orders" />}
                >
                  Về danh sách đơn hàng
                </Button>
              </div>
            </section>
          ) : !isEligibleStatus || !order.deliveredAt ? (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" aria-hidden="true" />
              <AlertTitle>Đơn hàng chưa đủ điều kiện khiếu nại</AlertTitle>
              <AlertDescription>
                Chỉ có thể gửi khiếu nại cho đơn hàng đã giao thành công trong
                vòng {BUSINESS_RULES.COMPLAINT_WINDOW_HOURS} giờ.
              </AlertDescription>
            </Alert>
          ) : isExpired ? (
            <Alert variant="destructive">
              <Lock className="size-4" aria-hidden="true" />
              <AlertTitle>Đã hết thời hạn khiếu nại 24 giờ</AlertTitle>
              <AlertDescription>
                Thời hạn gửi khiếu nại cho đơn hàng #{order.orderCode} đã kết
                thúc lúc{" "}
                {deadlineMs
                  ? formatViDateTime(new Date(deadlineMs).toISOString())
                  : ""}
                . Biểu mẫu đã được khóa.
              </AlertDescription>
            </Alert>
          ) : (
            /* COMPLAINT FORM */
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              {formError ? (
                <Alert variant="destructive" role="alert">
                  <AlertTitle>Không thể gửi khiếu nại</AlertTitle>
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              ) : null}

              {/* Category Selection */}
              <div className="flex flex-col gap-2.5">
                <span className="text-sm font-bold text-gray-900">
                  Lý do khiếu nại
                </span>
                <RadioGroup
                  value={category}
                  onValueChange={(val) => setCategory(val as ComplaintCategory)}
                  className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
                >
                  {COMPLAINT_CATEGORY_OPTIONS.map((option) => {
                    const checked = category === option.value;
                    return (
                      <Label
                        key={option.value}
                        htmlFor={`reason-${option.value}`}
                        className={`flex cursor-pointer items-center gap-2.5 rounded-lg border p-3.5 transition-colors ${
                          checked
                            ? "border-brand-forest bg-green-50 text-gray-900"
                            : "border-border-subtle bg-surface-warm text-gray-800 hover:border-brand-forest"
                        } ${
                          option.value === ComplaintCategory.OTHER
                            ? "sm:col-span-2"
                            : ""
                        }`}
                      >
                        <RadioGroupItem
                          id={`reason-${option.value}`}
                          value={option.value}
                        />
                        <span className="text-xs font-semibold">
                          {option.label}
                        </span>
                      </Label>
                    );
                  })}
                </RadioGroup>
              </div>

              {/* Affected Order Items */}
              <div className="flex flex-col gap-2.5 border-t border-border-subtle pt-5">
                <span className="text-sm font-bold text-gray-900">
                  Sản phẩm gặp sự cố
                </span>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {order.items.map((item) => {
                    const checked = affectedOrderItemIds.includes(item.id);
                    return (
                      <Label
                        key={item.id}
                        htmlFor={`item-${item.id}`}
                        className={`flex cursor-pointer items-center gap-2.5 rounded-lg border p-2.5 transition-colors ${
                          checked
                            ? "border-brand-forest bg-green-50"
                            : "border-border-subtle bg-surface-warm"
                        }`}
                      >
                        <Checkbox
                          id={`item-${item.id}`}
                          checked={checked}
                          onCheckedChange={() => toggleItem(item.id)}
                        />
                        <OrderItemThumb
                          src={item.productImageUrl}
                          alt={item.productName}
                        />
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate text-xs font-semibold text-gray-900">
                            {item.productName}
                          </span>
                          <span className="text-xs text-gray-500 tabular-nums">
                            {roundQuantity(item.quantity)} {item.unit}
                          </span>
                        </div>
                      </Label>
                    );
                  })}
                </div>
              </div>

              {/* Reason Description */}
              <div className="flex flex-col gap-1.5 border-t border-border-subtle pt-5">
                <div className="flex items-center justify-between gap-2">
                  <Label
                    htmlFor="complaint-reason"
                    className="text-sm font-bold text-gray-900"
                  >
                    Mô tả chi tiết tình trạng
                  </Label>
                  <span className="text-xs text-gray-500 tabular-nums">
                    {reason.trim().length} / {COMPLAINT_REASON_MAX_LENGTH} ký tự
                  </span>
                </div>
                <Textarea
                  id="complaint-reason"
                  rows={3}
                  minLength={COMPLAINT_REASON_MIN_LENGTH}
                  maxLength={COMPLAINT_REASON_MAX_LENGTH}
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Mô tả rõ tình trạng sản phẩm khi nhận hàng (tối thiểu 10 ký tự)..."
                  className="bg-surface-warm"
                />
              </div>

              {/* 1-5 Proof Images */}
              <div className="flex flex-col gap-3 border-t border-border-subtle pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-900">
                      Hình ảnh thực tế
                    </span>
                    <Badge variant="destructive">
                      Bắt buộc {BUSINESS_RULES.COMPLAINT_MIN_IMAGES}–
                      {BUSINESS_RULES.COMPLAINT_MAX_IMAGES} ảnh
                    </Badge>
                  </div>
                  <span className="text-xs font-semibold text-brand-dark tabular-nums">
                    {photos.length} / {BUSINESS_RULES.COMPLAINT_MAX_IMAGES} ảnh
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
                  {photos.map((photo, index) => (
                    <div
                      key={photo.previewUrl}
                      className="relative aspect-square overflow-hidden rounded-lg border border-border-subtle bg-surface-warm"
                    >
                      <ProofImageThumb
                        src={photo.previewUrl}
                        alt={photo.name || `Ảnh minh chứng ${index + 1}`}
                        sizes="120px"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Xóa ảnh ${index + 1}`}
                        onClick={() => handleRemovePhoto(index)}
                        className="absolute top-1 right-1 size-6 rounded-full bg-gray-900/80 text-white hover:bg-status-spoiled hover:text-white"
                      >
                        <X className="size-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  ))}

                  {photos.length < BUSINESS_RULES.COMPLAINT_MAX_IMAGES ? (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={isUploadingMedia}
                      onClick={() => photoInputRef.current?.click()}
                      className="flex aspect-square h-auto cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-brand-forest bg-green-50 p-2 text-center text-brand-dark hover:bg-green-100 disabled:opacity-50"
                    >
                      <ImagePlus className="size-5" aria-hidden="true" />
                      <span className="text-[11px] font-semibold">
                        {isUploadingMedia ? "Đang tải..." : "Thêm ảnh"}
                      </span>
                    </Button>
                  ) : null}
                </div>

                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="sr-only"
                  onChange={handlePhotoFilesChange}
                />
              </div>

              {/* Optional 1 Video (<= 15s, <= 15MB) */}
              <div className="flex flex-col gap-2.5 border-t border-border-subtle pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-bold text-gray-900">
                    Video mở hộp (tùy chọn)
                  </span>
                  <span className="text-xs text-gray-500 tabular-nums">
                    Tối đa 1 video, ≤{" "}
                    {BUSINESS_RULES.COMPLAINT_VIDEO_MAX_SECONDS}s, ≤ 15MB
                  </span>
                </div>

                {video ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-brand-forest bg-green-50 p-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Video
                        className="size-5 shrink-0 text-brand-forest"
                        aria-hidden="true"
                      />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-xs font-semibold text-gray-900">
                          {video.name}
                        </span>
                        <span className="text-xs text-gray-600 tabular-nums">
                          {(video.sizeBytes / (1024 * 1024)).toFixed(1)} MB —
                          Sẵn sàng tải lên khi gửi
                        </span>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setVideo(null)}
                    >
                      Xóa video
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={isUploadingMedia}
                    onClick={() => videoInputRef.current?.click()}
                    className="flex h-auto w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-border-subtle bg-surface-warm p-3.5 text-left hover:border-brand-forest hover:bg-surface-warm disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-green-50 text-brand-forest">
                        <Video className="size-5" aria-hidden="true" />
                      </span>
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-gray-900">
                          Chọn video quay cận cảnh sản phẩm
                        </span>
                        <span className="text-xs text-gray-500 tabular-nums">
                          Định dạng MP4, MOV, WebM (≤{" "}
                          {BUSINESS_RULES.COMPLAINT_VIDEO_MAX_SECONDS}s, ≤ 15MB)
                        </span>
                      </div>
                    </div>
                    <span className="shrink-0 rounded border border-border-subtle bg-white px-3 py-1.5 text-xs font-semibold text-brand-dark">
                      {isUploadingMedia ? "Đang tải..." : "Tải video"}
                    </span>
                  </Button>
                )}

                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm"
                  className="sr-only"
                  onChange={handleVideoFileChange}
                />

                {mediaError ? (
                  <Alert variant="destructive" role="alert">
                    <AlertDescription>{mediaError}</AlertDescription>
                  </Alert>
                ) : null}
              </div>

              {/* Submit */}
              <div className="flex flex-col justify-between gap-3 border-t border-border-subtle pt-5 sm:flex-row sm:items-center">
                <span className="text-xs text-gray-500">
                  Mỗi đơn hàng chỉ được gửi tối đa 1 khiếu nại trong{" "}
                  {BUSINESS_RULES.COMPLAINT_WINDOW_HOURS}h.
                </span>
                <Button
                  type="submit"
                  disabled={isPending || isUploadingMedia}
                  className="gap-2"
                >
                  <Send className="size-4" aria-hidden="true" />
                  <span>{isPending ? "Đang gửi..." : "Gửi khiếu nại"}</span>
                </Button>
              </div>
            </form>
          )}
        </div>

        {/* Right Column: Order Summary & 24h Policy */}
        <aside className="flex flex-col divide-y divide-border-subtle lg:col-span-4 lg:border-l lg:border-border-subtle lg:pl-6">
          <section
            aria-label="Tóm tắt đơn hàng"
            className="flex flex-col gap-4 pb-5"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-gray-900 tabular-nums">
                Đơn hàng #{order.orderCode}
              </h2>
              <span className="text-xs font-bold text-brand-forest tabular-nums">
                {formatVnd(order.totalAmountVnd)}
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center gap-3">
                  <OrderItemThumb
                    src={item.productImageUrl}
                    alt={item.productName}
                  />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-xs font-semibold text-gray-900">
                      {item.productName}
                    </span>
                    <span className="text-xs text-gray-500 tabular-nums">
                      {roundQuantity(item.quantity)} {item.unit} —{" "}
                      {formatVnd(item.lineTotalVnd)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section
            aria-label="Cam kết hỗ trợ 24h"
            className="flex flex-col gap-3 pt-5"
          >
            <h2 className="text-sm font-bold text-gray-900">
              Cam kết tươi ngon {BUSINESS_RULES.COMPLAINT_WINDOW_HOURS}h
            </h2>
            <ul className="list-disc space-y-2 pl-4 text-xs text-gray-600">
              <li>
                Hỗ trợ hoàn tiền hoặc giao bù miễn phí khi sản phẩm không đạt
                chất lượng.
              </li>
              <li>
                Áp dụng trong {BUSINESS_RULES.COMPLAINT_WINDOW_HOURS} giờ kể từ
                thời điểm đơn hàng được giao thành công.
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

export function OrderComplaintSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 lg:px-6"
    >
      <Skeleton className="h-8 w-64 bg-gray-200" />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <Skeleton className="h-32 w-full bg-gray-200" />
          <Skeleton className="h-40 w-full bg-gray-200" />
        </div>
        <div className="space-y-4 lg:col-span-4">
          <Skeleton className="h-48 w-full bg-gray-200" />
        </div>
      </div>
    </div>
  );
}

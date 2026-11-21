"use client";

import Link from "next/link";
import { useState, type ChangeEvent, type SubmitEvent } from "react";
import { BUSINESS_RULES, ComplaintResolution } from "@greenroots/shared";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  buttonVariants,
} from "@greenroots/ui";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileVideo,
  Image as ImageIcon,
  Leaf,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UploadCloud,
  Video,
} from "lucide-react";
import { FARM_METADATA } from "@/constants/farm-metadata.constant";

interface ComplaintViewProps {
  readonly orderId: string;
}

interface MockImageItem {
  readonly id: string;
  readonly name: string;
  readonly sizeKb: number;
}

interface MockVideoItem {
  readonly name: string;
  readonly sizeMb: number;
  readonly durationSec: number;
}

const COMPLAINT_REASONS = [
  "Nông sản bị dập nát do va đập / chèn ép khi vận chuyển",
  "Rau bị úa vàng, thâm nhũn, không đạt tiêu chuẩn tươi cắt sáng sớm",
  "Đóng gói thiếu số lượng / sai chủng loại so với đơn đặt",
  "Phát hiện dấu hiệu nấm bệnh hoặc sâu hại vượt ngưỡng kiểm định",
  "Lý do khác",
] as const;

const MOCK_ORDER_ITEMS = [
  { id: "item-1", name: "Xà lách Romaine hữu cơ", unitLabel: "Túi 300g" },
  { id: "item-2", name: "Cà chua bi Củ Chi", unitLabel: "Hộp 500g" },
  { id: "item-3", name: "Cải ngọt baby chuẩn VietGAP", unitLabel: "Bó 500g" },
] as const;

export function ComplaintView({ orderId }: ComplaintViewProps) {
  const [isWithin24Hours, setIsWithin24Hours] = useState(true);
  const [hoursRemaining] = useState(19);

  const [selectedReason, setSelectedReason] = useState<string>(
    COMPLAINT_REASONS[0],
  );
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([
    MOCK_ORDER_ITEMS[0].id,
  ]);
  const [description, setDescription] = useState(
    "Khi mở thùng giao hàng lúc sáng nay, túi xà lách Romaine ở góc dưới bị chèn ép dập nát khoảng 50%, chảy nước không thể dùng làm salad tươi được.",
  );
  const [resolution, setResolution] = useState<ComplaintResolution>(
    ComplaintResolution.REFUND,
  );
  const [contactPhone, setContactPhone] = useState("0908123456");

  const [images, setImages] = useState<MockImageItem[]>([
    { id: "img-1", name: "rau_romaine_dap_nat_1.jpg", sizeKb: 840 },
    { id: "img-2", name: "tem_lo_thu_hoach_2026.jpg", sizeKb: 620 },
  ]);
  const [video, setVideo] = useState<MockVideoItem | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [submittedComplaint, setSubmittedComplaint] = useState<{
    readonly complaintId: string;
    readonly createdAt: string;
  } | null>(null);

  function handleProductToggle(id: string) {
    setSelectedProductIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  function handleAddMockImage() {
    if (images.length >= 5) return;
    const nextIndex = images.length + 1;
    setImages((prev) => [
      ...prev,
      {
        id: `img-${Date.now()}-${nextIndex}`,
        name: `bang_chung_dap_nat_${nextIndex}.jpg`,
        sizeKb: Math.floor(400 + Math.random() * 800),
      },
    ]);
    setValidationError(null);
  }

  function handleImageFileChange(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remainingSlots = 5 - images.length;
    const newItems: MockImageItem[] = [];

    for (let i = 0; i < Math.min(files.length, remainingSlots); i++) {
      const file = files[i];
      newItems.push({
        id: `img-${Date.now()}-${i}`,
        name: file.name,
        sizeKb: Math.round(file.size / 1024),
      });
    }

    setImages((prev) => [...prev, ...newItems]);
    setValidationError(null);
  }

  function handleRemoveImage(id: string) {
    setImages((prev) => prev.filter((img) => img.id !== id));
  }

  function handleAddMockVideo() {
    setVideo({
      name: "video_kiem_tra_thung_rau_10s.mp4",
      sizeMb: 8.5,
      durationSec: 11,
    });
    setValidationError(null);
  }

  function handleVideoFileChange(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const sizeMb = Math.round((file.size / (1024 * 1024)) * 10) / 10;

    if (sizeMb > 15) {
      setValidationError(
        "Video vượt quá dung lượng tối đa cho phép (≤ 15MB). Vui lòng chọn clip ngắn hơn.",
      );
      return;
    }

    setVideo({
      name: file.name,
      sizeMb,
      durationSec: 12,
    });
    setValidationError(null);
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isWithin24Hours) {
      setValidationError("Đơn hàng đã vượt quá thời hạn khiếu nại 24h.");
      return;
    }

    if (images.length === 0) {
      setValidationError(
        "Bắt buộc tải từ 1 đến 5 ảnh chụp rõ phần nông sản dập nát và tem nhãn lô.",
      );
      return;
    }

    if (selectedProductIds.length === 0) {
      setValidationError(
        "Vui lòng chọn ít nhất 1 sản phẩm bị ảnh hưởng trong đơn hàng.",
      );
      return;
    }

    setSubmittedComplaint({
      complaintId: `CMP-${Date.now().toString().slice(-6)}`,
      createdAt: new Date().toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
      }),
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-3 pt-[148px] pb-16 lg:px-4 lg:pt-[124px]">
      {/* Top Navigation */}
      <div className="flex items-center justify-between border-b border-border-subtle pb-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-forest hover:underline"
        >
          <ArrowLeft className="size-4" />
          Về siêu thị nông sản
        </Link>
        <div className="flex items-center gap-2">
          <span className="hidden text-[11px] text-gray-500 sm:inline">
            Thử nghiệm demo:
          </span>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => setIsWithin24Hours((prev) => !prev)}
            className="text-[11px] font-semibold"
          >
            <RefreshCw className="mr-1 size-3" />
            {isWithin24Hours
              ? "Giả lập: Quá hạn 24h"
              : "Giả lập: Trong hạn 24h"}
          </Button>
        </div>
      </div>

      {/* Main Card */}
      <Card className="border-border-subtle bg-white shadow-sm">
        <CardHeader className="border-b border-border-subtle pb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge
              className={`border-0 font-bold ${
                isWithin24Hours
                  ? "bg-amber-100 text-amber-900"
                  : "bg-red-100 text-red-900"
              }`}
            >
              {isWithin24Hours ? "TRONG CỬA SỔ BẢO ĐẢM 24H" : "ĐÃ QUÁ HẠN 24H"}
            </Badge>
            <span className="text-xs font-semibold text-gray-500">
              Mã đơn hàng: <strong className="text-gray-900">{orderId}</strong>
            </span>
          </div>
          <CardTitle className="mt-2 text-xl font-extrabold text-gray-900">
            Khiếu nại nông sản dập nát &amp; bồi hoàn (SF-05)
          </CardTitle>
          <p className="text-xs text-gray-600">
            GreenRoots cam kết xử lý hoàn tiền hoặc giao bù trong 2 giờ đối với
            mọi sự cố dập nát, héo úa được ghi nhận trong vòng{" "}
            {BUSINESS_RULES.COMPLAINT_WINDOW_HOURS}h kể từ khi nhận hàng.
          </p>
        </CardHeader>

        <CardContent className="space-y-6 p-5 text-xs">
          {/* 24-Hour Validity Status Alert */}
          {isWithin24Hours ? (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-amber-900">
              <Clock className="mt-0.5 size-5 shrink-0 text-amber-600" />
              <div className="space-y-0.5">
                <p className="font-bold">
                  Thời hạn tiếp nhận khiếu nại còn lại: {hoursRemaining} giờ 42
                  phút
                </p>
                <p className="text-[11px] leading-relaxed text-amber-800">
                  Đơn hàng được giao thành công lúc 08:30 sáng nay. Để bảo đảm
                  kiểm định khách quan, vui lòng cung cấp ảnh chụp phần hư hại
                  kèm tem truy xuất nguồn gốc trên bao bì.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
              <ShieldAlert className="mt-0.5 size-5 shrink-0 text-red-600" />
              <div className="space-y-1">
                <p className="font-bold">
                  Đơn hàng {orderId} đã vượt quá thời hạn khiếu nại{" "}
                  {BUSINESS_RULES.COMPLAINT_WINDOW_HOURS} giờ
                </p>
                <p className="text-[11px] leading-relaxed text-red-800">
                  Rất tiếc, theo chính sách kiểm soát chất lượng nông sản tươi
                  sống, GreenRoots chỉ tiếp nhận yêu cầu hoàn tiền / đổi bù
                  trong vòng 24h sau khi nhận hàng. Vui lòng liên hệ hotline{" "}
                  <strong>{FARM_METADATA.hotline}</strong> nếu cần hỗ trợ kỹ
                  thuật canh tác hoặc khiếu nại đặc biệt.
                </p>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Field: Affected Products */}
            <div className="space-y-2">
              <label className="flex items-center gap-1.5 font-bold text-gray-900">
                <Leaf className="size-4 text-brand-forest" />
                Sản phẩm gặp sự cố trong đơn{" "}
                <span className="text-red-500">*</span>
              </label>
              <div className="grid gap-2 sm:grid-cols-3">
                {MOCK_ORDER_ITEMS.map((item) => {
                  const isChecked = selectedProductIds.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={!isWithin24Hours}
                      onClick={() => handleProductToggle(item.id)}
                      className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 text-left transition ${
                        isChecked
                          ? "border-2 border-brand-forest bg-green-50/60 font-bold text-brand-dark"
                          : "border-border-subtle bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <p className="truncate text-xs">{item.name}</p>
                        <p className="text-[10px] text-gray-500">
                          {item.unitLabel}
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        readOnly
                        className="size-4 accent-brand-forest"
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Field: Incident Reason */}
            <div className="space-y-1.5">
              <label
                htmlFor="complaint-reason"
                className="font-bold text-gray-900"
              >
                Lý do khiếu nại chính <span className="text-red-500">*</span>
              </label>
              <Select
                disabled={!isWithin24Hours}
                value={selectedReason}
                onValueChange={(val) => {
                  if (val) setSelectedReason(val);
                }}
              >
                <SelectTrigger
                  id="complaint-reason"
                  className="h-10 w-full bg-white text-xs"
                >
                  <SelectValue placeholder="Chọn lý do sự cố" />
                </SelectTrigger>
                <SelectContent>
                  {COMPLAINT_REASONS.map((reason) => (
                    <SelectItem key={reason} value={reason}>
                      {reason}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Field: Detailed Description */}
            <div className="space-y-1.5">
              <label
                htmlFor="complaint-description"
                className="font-bold text-gray-900"
              >
                Mô tả chi tiết tình trạng dập nát{" "}
                <span className="text-red-500">*</span>
              </label>
              <textarea
                id="complaint-description"
                required
                disabled={!isWithin24Hours}
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Mô tả mức độ dập hỏng, số lượng bị ảnh hưởng..."
                className="w-full rounded-xl border border-border-subtle bg-white p-3 text-xs text-gray-900 outline-none focus:border-brand-forest"
              />
            </div>

            {/* Field: Proof Images (Mandatory 1 - 5) */}
            <div className="space-y-2 rounded-xl border border-border-subtle bg-surface-warm p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <label className="flex items-center gap-1.5 font-bold text-gray-900">
                    <ImageIcon className="size-4 text-brand-forest" />
                    Ảnh chụp bằng chứng dập nát{" "}
                    <span className="text-red-500">* (Bắt buộc 1–5 ảnh)</span>
                  </label>
                  <p className="text-[11px] text-gray-500">
                    Vui lòng chụp cận cảnh vết dập và nhãn mác lô thu hoạch trên
                    bao bì.
                  </p>
                </div>
                <Badge
                  className={`border-0 font-bold ${
                    images.length >= 1
                      ? "bg-green-100 text-brand-dark"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {images.length} / 5 ảnh
                </Badge>
              </div>

              {/* Action Buttons for Adding Images */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <label className="cursor-pointer">
                  <span
                    className={buttonVariants({
                      variant: "outline",
                      size: "xs",
                      className: "font-bold text-gray-700",
                    })}
                  >
                    <UploadCloud className="mr-1 size-3.5" />
                    Chọn ảnh từ máy
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={!isWithin24Hours || images.length >= 5}
                    onChange={handleImageFileChange}
                    className="hidden"
                  />
                </label>

                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={!isWithin24Hours || images.length >= 5}
                  onClick={handleAddMockImage}
                  className="border-brand-forest/40 text-[11px] text-brand-forest"
                >
                  <Plus className="mr-1 size-3" />+ Thêm ảnh mẫu minh họa
                </Button>
              </div>

              {/* Images Preview List */}
              {images.length > 0 ? (
                <div className="grid gap-2 pt-2 sm:grid-cols-2">
                  {images.map((img) => (
                    <div
                      key={img.id}
                      className="flex items-center justify-between rounded-lg border border-border-subtle bg-white p-2.5 text-xs"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded bg-green-50 text-brand-forest">
                          <ImageIcon className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-gray-900">
                            {img.name}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            {img.sizeKb} KB
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={!isWithin24Hours}
                        onClick={() => handleRemoveImage(img.id)}
                        className="cursor-pointer p-1 text-gray-400 hover:text-red-600"
                        aria-label="Xóa ảnh"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Field: Optional Video (<= 15s, <= 15MB) */}
            <div className="space-y-2 rounded-xl border border-border-subtle bg-surface-warm p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <label className="flex items-center gap-1.5 font-bold text-gray-900">
                    <Video className="size-4 text-brand-forest" />
                    Video kiểm tra mở hộp (Tùy chọn, ≤ 15s &amp; ≤ 15MB)
                  </label>
                  <p className="text-[11px] text-gray-500">
                    Video quay cận cảnh lúc mở thùng giúp đẩy nhanh tiến độ hoàn
                    tiền tức thì.
                  </p>
                </div>
                {video ? (
                  <Badge className="border-0 bg-blue-100 font-bold text-blue-800">
                    1 video
                  </Badge>
                ) : null}
              </div>

              {!video ? (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <label className="cursor-pointer">
                    <span
                      className={buttonVariants({
                        variant: "outline",
                        size: "xs",
                        className: "font-bold text-gray-700",
                      })}
                    >
                      <UploadCloud className="mr-1 size-3.5" />
                      Chọn video ngắn
                    </span>
                    <input
                      type="file"
                      accept="video/*"
                      disabled={!isWithin24Hours}
                      onChange={handleVideoFileChange}
                      className="hidden"
                    />
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={!isWithin24Hours}
                    onClick={handleAddMockVideo}
                    className="border-brand-forest/40 text-[11px] text-brand-forest"
                  >
                    <Plus className="mr-1 size-3" />+ Thêm video mẫu (11s,
                    8.5MB)
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-white p-2.5 pt-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded bg-blue-50 text-blue-600">
                      <FileVideo className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-gray-900">
                        {video.name}
                      </p>
                      <p className="text-[10px] text-gray-500">
                        {video.sizeMb} MB · Thời lượng: {video.durationSec}s
                        (&le; 15s đạt chuẩn)
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!isWithin24Hours}
                    onClick={() => setVideo(null)}
                    className="cursor-pointer p-1 text-gray-400 hover:text-red-600"
                    aria-label="Xóa video"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Field: Proposed Resolution */}
            <div className="space-y-2">
              <label className="font-bold text-gray-900">
                Phương án bồi hoàn đề xuất
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label
                  className={`flex cursor-pointer items-start justify-between rounded-xl border p-3.5 transition ${
                    resolution === ComplaintResolution.REFUND
                      ? "border-2 border-brand-forest bg-green-50/60 font-bold text-brand-dark"
                      : "border-border-subtle bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <div className="space-y-0.5">
                    <p className="text-xs">Hoàn tiền lại qua PayOS / Ví</p>
                    <p className="text-[11px] font-normal text-gray-500">
                      Hoàn tiền trực tiếp theo giá trị sản phẩm hư hại.
                    </p>
                  </div>
                  <input
                    type="radio"
                    name="resolution"
                    disabled={!isWithin24Hours}
                    value={ComplaintResolution.REFUND}
                    checked={resolution === ComplaintResolution.REFUND}
                    onChange={() => setResolution(ComplaintResolution.REFUND)}
                    className="mt-0.5 accent-brand-forest"
                  />
                </label>

                <label
                  className={`flex cursor-pointer items-start justify-between rounded-xl border p-3.5 transition ${
                    resolution === ComplaintResolution.REPLACEMENT
                      ? "border-2 border-brand-forest bg-green-50/60 font-bold text-brand-dark"
                      : "border-border-subtle bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <div className="space-y-0.5">
                    <p className="text-xs">Giao bù đợt thu hoạch sớm nhất</p>
                    <p className="text-[11px] font-normal text-gray-500">
                      Cắt tươi lúc 4h sáng mai và giao hỏa tốc tận nhà miễn phí.
                    </p>
                  </div>
                  <input
                    type="radio"
                    name="resolution"
                    disabled={!isWithin24Hours}
                    value={ComplaintResolution.REPLACEMENT}
                    checked={resolution === ComplaintResolution.REPLACEMENT}
                    onChange={() =>
                      setResolution(ComplaintResolution.REPLACEMENT)
                    }
                    className="mt-0.5 accent-brand-forest"
                  />
                </label>
              </div>
            </div>

            {/* Field: Contact Phone */}
            <div className="space-y-1">
              <label
                htmlFor="contact-phone"
                className="font-bold text-gray-900"
              >
                Số điện thoại CSKH liên hệ phản hồi
              </label>
              <Input
                id="contact-phone"
                required
                disabled={!isWithin24Hours}
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="0901234567"
                className="h-10 text-xs"
              />
            </div>

            {/* Validation Error Message */}
            {validationError ? (
              <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                <AlertTriangle className="size-4 shrink-0 text-red-600" />
                <span>{validationError}</span>
              </div>
            ) : null}

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={!isWithin24Hours || images.length === 0}
              className="h-12 w-full cursor-pointer rounded-xl bg-red-600 text-sm font-extrabold text-white shadow-md hover:bg-red-700 disabled:opacity-50"
            >
              GỬI KHIẾU NẠI NÔNG SẢN (CAM KẾT 2H PHẢN HỒI)
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Complaint Success Dialog */}
      <Dialog
        open={Boolean(submittedComplaint)}
        onOpenChange={(open) => {
          if (!open) setSubmittedComplaint(null);
        }}
      >
        <DialogContent className="bg-white sm:max-w-md">
          <DialogHeader className="text-center">
            <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-brand-forest">
              <CheckCircle2 className="size-8" />
            </div>
            <DialogTitle className="text-lg font-extrabold text-gray-900">
              Tiếp nhận khiếu nại thành công!
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-600">
              Mã khiếu nại của bạn:{" "}
              <strong className="font-mono font-extrabold text-brand-dark">
                {submittedComplaint?.complaintId}
              </strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 p-2 text-xs">
            <div className="space-y-1.5 rounded-xl border border-border-subtle bg-surface-warm p-3.5 text-gray-700">
              <p>
                <strong className="text-gray-900">Đơn hàng:</strong> {orderId}
              </p>
              <p>
                <strong className="text-gray-900">Phương án:</strong>{" "}
                {resolution === ComplaintResolution.REFUND
                  ? "Hoàn tiền qua PayOS"
                  : "Giao bù lượt thu hoạch mới"}
              </p>
              <p>
                <strong className="text-gray-900">Bằng chứng:</strong>{" "}
                {images.length} ảnh
                {video ? " + 1 video ngắn" : ""}
              </p>
              <p>
                <strong className="text-gray-900">Thời gian gửi:</strong>{" "}
                {submittedComplaint?.createdAt}
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-3 font-semibold text-status-fresh">
              <ShieldCheck className="size-5 shrink-0" />
              <span>
                Chuyên viên GreenRoots sẽ đối chiếu nhật ký lô thu hoạch và gọi
                tới {contactPhone} trong vòng 2 giờ làm việc.
              </span>
            </div>

            <div className="flex gap-2 pt-2">
              <Link
                href="/"
                className={buttonVariants({
                  className:
                    "w-full bg-brand-forest hover:bg-brand-dark text-white font-bold rounded-xl",
                })}
              >
                Về trang chủ siêu thị
              </Link>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

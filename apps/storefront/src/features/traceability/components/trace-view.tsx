import Link from "next/link";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  buttonVariants,
} from "@greenroots/ui";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Droplets,
  Lock,
  ShieldCheck,
  Sprout,
} from "lucide-react";
import {
  BATCH_STATUS_LABELS,
  FARMING_ACTION_LABELS,
  SEASON_STATUS_LABELS,
} from "@/constants/domain-labels.constant";
import { formatViDate } from "@/lib/format";
import type { BatchTraceRecord } from "@/types/storefront.types";

interface TraceViewProps {
  readonly record?: BatchTraceRecord;
  readonly batchCode: string;
}

export function TraceView({ record, batchCode }: TraceViewProps) {
  if (!record) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-[156px] pb-16 lg:pt-[128px]">
        <Card className="border-red-200 bg-white">
          <CardContent className="space-y-3 p-6 text-center">
            <p className="text-base font-extrabold text-red-600">
              Không tìm thấy mã lô {batchCode}
            </p>
            <p className="text-xs text-gray-600">
              Vui lòng kiểm tra lại tem QR trên bao bì nông sản hoặc thử mã mẫu
              BATCH-2026-TOM-01.
            </p>
            <Link
              href="/"
              className={buttonVariants({
                className:
                  "bg-brand-forest hover:bg-brand-dark text-white font-bold",
              })}
            >
              <ArrowLeft className="size-4" />
              Về trang chủ
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-3 pt-[152px] pb-16 lg:px-4 lg:pt-[124px]">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-forest hover:underline"
      >
        <ArrowLeft className="size-4" />
        Quay lại siêu thị nông sản
      </Link>

      <Card className="border-2 border-brand-forest bg-white shadow-sm">
        <CardHeader className="border-b border-border-subtle pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge className="border-0 bg-green-100 font-bold text-brand-dark">
              {BATCH_STATUS_LABELS[record.status]}
            </Badge>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-status-fresh">
              <Lock className="size-3.5" />
              Nhật ký bất biến (Append-Only)
            </span>
          </div>
          <CardTitle className="mt-2 text-xl font-extrabold text-gray-900">
            {record.productName} ({record.unitLabel})
          </CardTitle>
          <p className="text-xs font-semibold text-gray-600">
            Mã lô truy xuất: {record.batchCode}
          </p>
        </CardHeader>

        <CardContent className="grid grid-cols-2 gap-3 p-4 text-xs">
          <div className="rounded-xl border border-border-subtle bg-surface-warm p-3">
            <p className="flex items-center gap-1 text-gray-500">
              <Calendar className="size-3.5 text-brand-forest" />
              Ngày thu hoạch
            </p>
            <p className="mt-1 font-bold text-gray-900">
              {formatViDate(record.harvestDate)}
            </p>
          </div>
          <div className="rounded-xl border border-border-subtle bg-surface-warm p-3">
            <p className="flex items-center gap-1 text-gray-500">
              <Calendar className="size-3.5 text-red-600" />
              Hạn sử dụng tươi
            </p>
            <p className="mt-1 font-bold text-red-600">
              {formatViDate(record.expirationDate)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border-subtle bg-white shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-extrabold text-brand-dark">
            <ShieldCheck className="size-4 text-brand-forest" />
            Hồ sơ thửa đất &amp; Kiểm định môi trường
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5 p-4 pt-2 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-500">Thửa canh tác</span>
            <span className="font-bold text-gray-900">
              {record.plotCode} · {record.plotName} ({record.areaSqm} m²)
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Mùa vụ</span>
            <span className="font-bold text-gray-900">
              {record.seasonName} ({SEASON_STATUS_LABELS[record.seasonStatus]})
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 border-t border-border-subtle pt-2">
            <div className="rounded-lg bg-green-50 p-2 text-center">
              <p className="text-gray-500">pH Đất</p>
              <p className="font-extrabold text-brand-dark">{record.soilPh}</p>
            </div>
            <div className="rounded-lg bg-green-50 p-2 text-center">
              <p className="flex items-center justify-center gap-1 text-gray-500">
                <Droplets className="size-3" /> pH Nước
              </p>
              <p className="font-extrabold text-brand-dark">{record.waterPh}</p>
            </div>
            <div className="rounded-lg bg-green-50 p-2 text-center">
              <p className="text-gray-500">Kim loại nặng</p>
              <p className="flex items-center justify-center gap-1 font-extrabold text-status-fresh">
                <CheckCircle2 className="size-3.5" />
                {record.heavyMetalsPass ? "Đạt chuẩn" : "Cảnh báo"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border-subtle bg-white shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-extrabold text-brand-dark">
            <Sprout className="size-4 text-brand-forest" />
            Dòng thời gian nhật ký canh tác ({record.farmingLogs.length} mốc)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-4 pt-2">
          {record.farmingLogs.map((entry) => (
            <div
              key={entry.id}
              className="relative space-y-1 border-l-2 border-green-200 pl-5"
            >
              <span className="absolute top-1 -left-[7px] h-3 w-3 rounded-full border-2 border-white bg-brand-forest" />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-brand-dark">
                  {FARMING_ACTION_LABELS[entry.actionType]}
                </span>
                <span className="text-[11px] text-gray-500">
                  {formatViDate(entry.loggedAt)}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-gray-700">
                {entry.description}
              </p>
              <p className="text-[11px] text-gray-500">
                Xác nhận: {entry.engineerName}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

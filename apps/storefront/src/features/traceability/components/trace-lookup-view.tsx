"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type SubmitEvent } from "react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  buttonVariants,
} from "@greenroots/ui";
import {
  ArrowRight,
  ChevronRight,
  QrCode,
  Search,
  ShieldCheck,
  Sprout,
} from "lucide-react";
import { FARM_METADATA } from "@/constants/farm-metadata.constant";
import { formatViDate } from "@/lib/format";
import { buildTraceDetailHref } from "@/lib/navigation";
import type { BatchTraceRecord } from "@/types/storefront.types";

interface TraceLookupContentProps {
  readonly records: readonly BatchTraceRecord[];
  readonly batchCode: string;
  readonly previewCode: string;
  readonly onBatchCodeChange?: (value: string) => void;
  readonly onSelectSample?: (code: string) => void;
  readonly onSubmit?: (event: SubmitEvent<HTMLFormElement>) => void;
}

/**
 * Pure presentational `/trace` directory layout decoupled from Next.js router hooks.
 *
 * @param props Batch records, controlled input/preview state, and interaction handlers.
 * @returns Traceability directory hero, live preview, and recent harvest grid.
 */
export function TraceLookupContent({
  records,
  batchCode,
  previewCode,
  onBatchCodeChange,
  onSelectSample,
  onSubmit,
}: TraceLookupContentProps) {
  const batchCodeInputId = useId();
  const previewRecord =
    records.find((item) => item.batchCode === previewCode) ?? records.at(0);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:px-6">
      <nav
        aria-label="Đường dẫn"
        className="flex flex-wrap items-center gap-1.5 text-[13px] text-gray-500"
      >
        <Link href="/" className="transition-colors hover:text-brand-forest">
          Trang chủ
        </Link>
        <ChevronRight className="size-3.5" aria-hidden="true" />
        <span className="font-semibold text-gray-900">
          Tra cứu nguồn gốc QR
        </span>
      </nav>

      <section aria-label="Tra cứu mã lô nông sản">
        <Card className="gap-0 rounded-2xl border-border-subtle bg-surface-card py-0 shadow-sm">
          <CardContent className="grid grid-cols-1 items-center gap-6 p-6 md:p-8 lg:grid-cols-12">
            <div className="flex flex-col gap-4 lg:col-span-7">
              <Badge className="h-auto self-start rounded-full border-0 bg-green-50 px-3 py-1 text-[11px] font-semibold text-brand-dark">
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                Nhật ký canh tác bất biến
              </Badge>

              <div className="flex flex-col gap-1.5">
                <h1 className="text-[28px] leading-tight font-extrabold tracking-tight text-balance text-gray-900 md:text-4xl">
                  Tra cứu nguồn gốc từ nông trại
                </h1>
                <p className="max-w-prose text-sm leading-relaxed text-pretty text-gray-500 sm:text-[15px]">
                  Nhập mã lô in trên tem bao bì hoặc quét mã QR để kiểm tra thời
                  điểm thu hoạch, nhân sự phụ trách, kết quả kiểm nghiệm đất
                  nước và toàn bộ lịch sử chăm sóc.
                </p>
              </div>

              <form
                onSubmit={onSubmit}
                className="flex flex-col gap-2 sm:flex-row"
              >
                <div className="flex flex-1 items-center gap-2 rounded-lg border border-border-subtle bg-surface-warm px-4 py-2 focus-within:border-brand-forest focus-within:ring-1 focus-within:ring-brand-forest">
                  <QrCode
                    className="size-5 shrink-0 text-brand-forest"
                    aria-hidden="true"
                  />
                  <Label htmlFor={batchCodeInputId} className="sr-only">
                    Mã lô thu hoạch
                  </Label>
                  <Input
                    id={batchCodeInputId}
                    type="text"
                    value={batchCode}
                    onChange={(event) =>
                      onBatchCodeChange?.(event.target.value)
                    }
                    placeholder="Ví dụ: BATCH-2026-TOM-01"
                    className="h-auto border-0 bg-transparent p-0 text-[13px] font-semibold tracking-wide text-gray-900 tabular-nums shadow-none placeholder:text-gray-500 focus-visible:ring-0"
                  />
                </div>

                <Button
                  type="submit"
                  className="h-11 shrink-0 cursor-pointer rounded-lg bg-brand-forest px-6 text-sm font-semibold text-white hover:bg-brand-dark"
                >
                  <Search className="size-4" aria-hidden="true" />
                  Tra cứu lô hàng
                </Button>
              </form>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold text-gray-500">
                  Mã lô mẫu:
                </span>
                {records.slice(0, 3).map((record) => {
                  const isActive =
                    previewRecord?.batchCode === record.batchCode;
                  return (
                    <Button
                      key={record.batchCode}
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => onSelectSample?.(record.batchCode)}
                      className={`h-auto cursor-pointer rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide tabular-nums ${
                        isActive
                          ? "border-brand-forest bg-green-50 text-brand-dark"
                          : "border-border-subtle bg-surface-warm text-brand-dark hover:border-brand-forest"
                      }`}
                    >
                      {record.batchCode}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-5">
              {previewRecord ? (
                <div className="flex flex-col gap-4 rounded-2xl border border-border-subtle bg-surface-warm p-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-green-50 text-brand-forest">
                        <Sprout className="size-7" aria-hidden="true" />
                      </span>
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-xs font-semibold tracking-wide text-brand-dark tabular-nums">
                          {previewRecord.batchCode}
                        </span>
                        <h2 className="text-[15px] font-semibold text-gray-900">
                          {previewRecord.productName} ({previewRecord.unitLabel}
                          )
                        </h2>
                      </div>
                    </div>
                    <Badge className="h-auto shrink-0 rounded-full border-0 bg-green-50 px-2.5 py-0.5 text-[11px] font-semibold text-brand-dark">
                      Hợp lệ
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-0.5 rounded-lg border border-border-subtle bg-surface-card p-2.5">
                      <span className="text-[11px] font-semibold text-gray-500">
                        Thu hoạch
                      </span>
                      <span className="text-xs font-semibold text-gray-900 tabular-nums">
                        {formatViDate(previewRecord.harvestDate)}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5 rounded-lg border border-border-subtle bg-surface-card p-2.5">
                      <span className="text-[11px] font-semibold text-gray-500">
                        Khu vực
                      </span>
                      <span className="text-xs font-semibold text-gray-900">
                        {previewRecord.plotCode} · {FARM_METADATA.locationShort}
                      </span>
                    </div>
                  </div>

                  <Link
                    href={`/trace/${encodeURIComponent(previewRecord.batchCode)}`}
                    className={buttonVariants({
                      className:
                        "h-10 w-full rounded-lg bg-brand-forest px-4 text-sm font-semibold text-white hover:bg-brand-dark",
                    })}
                  >
                    Xem nhật ký chi tiết
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </section>

      <section
        aria-label="Các lô thu hoạch gần đây"
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <h2 className="text-lg font-bold text-gray-900">
            Lô thu hoạch mới xuất vườn
          </h2>
          <span className="text-[13px] text-gray-500">
            Nhấn vào từng lô để mở nhật ký canh tác và kiểm nghiệm chi tiết
          </span>
        </div>

        <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {records.map((record) => (
            <Card
              key={record.batchCode}
              className="h-full gap-0 rounded-2xl border-border-subtle bg-surface-card py-0 shadow-sm"
            >
              <div className="flex h-36 items-center justify-center bg-green-50 text-brand-forest">
                <Sprout className="size-12 opacity-80" aria-hidden="true" />
              </div>
              <CardContent className="flex flex-1 flex-col gap-2 p-4">
                <span className="text-xs font-semibold tracking-wide text-brand-dark tabular-nums">
                  {record.batchCode}
                </span>
                <h3 className="text-[15px] font-semibold text-gray-900">
                  {record.productName} ({record.unitLabel})
                </h3>
                <span className="text-[13px] text-gray-500 tabular-nums">
                  Thu hoạch {formatViDate(record.harvestDate)} ·{" "}
                  {record.plotCode}
                </span>
                <Link
                  href={`/trace/${encodeURIComponent(record.batchCode)}`}
                  className="mt-auto inline-flex items-center justify-between border-t border-border-subtle pt-2.5 text-xs font-semibold text-brand-forest hover:underline focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:outline-none"
                >
                  <span>Xem nhật ký</span>
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

interface TraceLookupViewProps {
  readonly records: readonly BatchTraceRecord[];
}

/**
 * Interactive QR traceability lookup landing view matching the `/trace` prototype layout.
 * Sample chips update the live preview card while form submission navigates to `/trace/[batchCode]`.
 *
 * @param props Showcase batch records to display and preview.
 * @returns Interactive lookup container wired to Next.js navigation.
 */
export function TraceLookupView({ records }: TraceLookupViewProps) {
  const router = useRouter();
  const defaultCode = records.at(0)?.batchCode ?? "BATCH-2026-TOM-01";
  const [batchCode, setBatchCode] = useState(defaultCode);
  const [previewCode, setPreviewCode] = useState(defaultCode);

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetHref = buildTraceDetailHref(batchCode);
    if (!targetHref) {
      return;
    }
    router.push(targetHref);
  }

  function handleSelectSample(code: string) {
    setBatchCode(code);
    setPreviewCode(code);
  }

  return (
    <TraceLookupContent
      records={records}
      batchCode={batchCode}
      previewCode={previewCode}
      onBatchCodeChange={setBatchCode}
      onSelectSample={handleSelectSample}
      onSubmit={handleSubmit}
    />
  );
}

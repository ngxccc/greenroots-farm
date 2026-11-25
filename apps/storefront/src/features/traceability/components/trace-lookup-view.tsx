"use client";

import Link from "next/link";
import { useId, useState, useTransition, type SubmitEvent } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Label,
} from "@greenroots/ui";
import { AlertCircle, ArrowRight, QrCode, Search } from "lucide-react";
import { TraceProductImage } from "@/features/traceability/components/trace-product-image";
import { lookupTraceBatchAction } from "@/features/traceability/actions/trace-actions";
import { toRecentTracePreview } from "@/features/traceability/utils/trace-mapper";
import { formatViDateTime } from "@/lib/format";
import { filterApprovedProductImages } from "@/lib/image-url";
import type { RecentTraceBatchItem } from "@/features/traceability/types/trace.types";

interface TraceLookupContentProps {
  readonly records: readonly RecentTraceBatchItem[];
  readonly batchCode: string;
  readonly previewCode?: string;
  readonly previewRecord?: RecentTraceBatchItem | null;
  readonly notFoundCode?: string | null;
  readonly lookupError?: string | null;
  readonly isPending?: boolean;
  readonly onBatchCodeChange?: (value: string) => void;
  readonly onSubmit?: (event: SubmitEvent<HTMLFormElement>) => void;
}

/**
 * Pure presentational `/trace` directory layout matching the flat, divider-driven mockup.
 *
 * @param props Recent batch items, controlled input/preview state, and form handlers.
 * @returns Traceability lookup hero, live preview/not-found panel, and recent harvest grid.
 */
export function TraceLookupContent({
  records,
  batchCode,
  previewCode,
  previewRecord: explicitPreviewRecord,
  notFoundCode,
  lookupError,
  isPending = false,
  onBatchCodeChange,
  onSubmit,
}: TraceLookupContentProps) {
  const batchCodeInputId = useId();
  const previewRecord =
    explicitPreviewRecord !== undefined
      ? explicitPreviewRecord
      : (records.find((item) => item.batchCode === previewCode) ??
        records.at(0) ??
        null);

  const previewImageUrl = previewRecord
    ? filterApprovedProductImages(previewRecord.product.imageUrls)[0]
    : undefined;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:px-6">
      <Breadcrumb aria-label="Đường dẫn">
        <BreadcrumbList className="text-[13px] text-gray-500">
          <BreadcrumbItem>
            <BreadcrumbLink
              render={<Link href="/" />}
              className="hover:text-brand-forest"
            >
              Trang chủ
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-semibold text-gray-900">
              Tra cứu nguồn gốc QR
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <section
        aria-label="Tra cứu mã lô nông sản"
        className="grid grid-cols-1 items-center gap-8 border-b border-border-subtle pb-8 lg:grid-cols-12"
      >
        <div className="flex flex-col gap-4 lg:col-span-7">
          <div className="flex flex-col gap-1">
            <h1 className="text-[28px] leading-tight font-extrabold tracking-tight text-balance text-gray-900 md:text-4xl">
              Tra cứu nguồn gốc từ nông trại
            </h1>
            <p className="max-w-prose text-[15px] leading-relaxed text-pretty text-gray-500">
              Nhập mã lô in trên tem bao bì hoặc quét mã QR để kiểm tra thời
              điểm thu hoạch, nhân sự phụ trách, kết quả kiểm nghiệm đất nước và
              toàn bộ lịch sử chăm sóc.
            </p>
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
            <Label htmlFor={batchCodeInputId} className="sr-only">
              Mã lô thu hoạch
            </Label>
            <InputGroup className="h-11 flex-1 rounded-lg bg-surface-warm px-3.5 shadow-none has-[[data-slot=input-group-control]:focus-visible]:border-brand-forest has-[[data-slot=input-group-control]:focus-visible]:ring-1 has-[[data-slot=input-group-control]:focus-visible]:ring-brand-forest dark:bg-surface-warm">
              <InputGroupAddon className="py-0 pl-0 text-brand-forest">
                <QrCode className="size-5" aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupInput
                id={batchCodeInputId}
                type="text"
                value={batchCode}
                onChange={(event) => onBatchCodeChange?.(event.target.value)}
                placeholder="Ví dụ: BATCH-2026-TOM-01"
                className="h-9 py-1.5 text-[13px] font-medium tracking-wide text-gray-900 tabular-nums placeholder:text-gray-500"
              />
            </InputGroup>

            <Button
              type="submit"
              disabled={isPending}
              className="h-11 shrink-0 cursor-pointer rounded-lg bg-brand-forest px-6 text-sm font-semibold text-white hover:bg-brand-dark"
            >
              <Search className="size-4" aria-hidden="true" />
              {isPending ? "Đang tra cứu..." : "Tra cứu lô hàng"}
            </Button>
          </form>
        </div>

        <div className="lg:col-span-5 lg:border-l lg:border-border-subtle lg:pl-8">
          {notFoundCode ? (
            <Alert
              id="trace-not-found"
              variant="destructive"
              className="rounded-lg border-red-200 bg-surface-card p-6 text-gray-900"
            >
              <AlertCircle className="size-5 text-red-700" aria-hidden="true" />
              <AlertTitle className="text-[15px] font-semibold text-red-700">
                Không tìm thấy mã lô {notFoundCode}
              </AlertTitle>
              <AlertDescription className="text-[13px] text-gray-600">
                Vui lòng kiểm tra lại ký tự in dưới mã QR trên tem bao bì hoặc
                chọn một lô thu hoạch gần đây bên dưới.
              </AlertDescription>
            </Alert>
          ) : lookupError ? (
            <Alert
              variant="destructive"
              className="rounded-lg border-red-200 bg-surface-card p-6 text-gray-900"
            >
              <AlertCircle className="size-5 text-red-700" aria-hidden="true" />
              <AlertTitle className="text-[15px] font-semibold text-red-700">
                Không thể tra cứu
              </AlertTitle>
              <AlertDescription className="text-[13px] text-gray-600">
                {lookupError}
              </AlertDescription>
            </Alert>
          ) : previewRecord ? (
            <div id="trace-preview-card" className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <TraceProductImage
                    src={previewImageUrl}
                    alt={previewRecord.product.name}
                    width={56}
                    height={56}
                    loading="eager"
                    className="size-14 shrink-0 rounded-md bg-green-50 object-cover"
                    fallbackClassName="flex size-14 shrink-0 items-center justify-center rounded-md bg-green-50 text-brand-forest"
                    iconClassName="size-7"
                  />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[13px] font-medium tracking-wide text-brand-dark tabular-nums">
                      {previewRecord.batchCode}
                    </span>
                    <h2 className="text-[15px] font-semibold text-gray-900">
                      {previewRecord.product.name} ({previewRecord.product.unit}
                      )
                    </h2>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 divide-x divide-border-subtle border-y border-border-subtle py-2">
                <div className="flex flex-col gap-0.5 pr-3">
                  <span className="text-[11px] font-semibold text-gray-500">
                    Thu hoạch
                  </span>
                  <span className="text-xs font-semibold text-gray-900 tabular-nums">
                    {formatViDateTime(previewRecord.harvestDate)}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 pl-4">
                  <span className="text-[11px] font-semibold text-gray-500">
                    Khu vực
                  </span>
                  <span className="text-xs font-semibold text-gray-900">
                    {previewRecord.plot.name}
                  </span>
                </div>
              </div>

              <Button
                nativeButton={false}
                render={
                  <Link
                    href={`/trace/${encodeURIComponent(previewRecord.batchCode)}`}
                  />
                }
                className="h-10 w-full rounded-lg bg-brand-forest px-4 text-sm font-semibold text-white hover:bg-brand-dark"
              >
                Xem nhật ký chi tiết
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 py-2 text-[13px] text-gray-500">
              <p className="font-semibold text-gray-900">
                Sẵn sàng tra cứu mã lô
              </p>
              <p>
                Nhập mã lô in trên tem QR ở ô bên cạnh hoặc chọn một lô thu
                hoạch mới xuất vườn bên dưới để xem nhật ký chi tiết.
              </p>
            </div>
          )}
        </div>
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

        {records.length === 0 ? (
          <p className="rounded-lg border border-border-subtle bg-surface-warm p-6 text-center text-[13px] text-gray-500">
            Hiện chưa có lô thu hoạch đang mở bán nào trong hệ thống.
          </p>
        ) : (
          <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {records.map((record) => {
              const cardImageUrl = filterApprovedProductImages(
                record.product.imageUrls,
              )[0];
              return (
                <article
                  key={record.batchCode}
                  className="flex h-full flex-col overflow-hidden rounded-lg border border-border-subtle bg-surface-card"
                >
                  <TraceProductImage
                    src={cardImageUrl}
                    alt={record.product.name}
                    width={400}
                    height={160}
                    className="h-40 w-full bg-green-50 object-cover"
                    fallbackClassName="flex h-40 w-full items-center justify-center bg-green-50 text-brand-forest"
                    iconClassName="size-12 opacity-80"
                  />
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <span className="text-[13px] font-medium tracking-wide text-brand-dark tabular-nums">
                      {record.batchCode}
                    </span>
                    <h3 className="truncate text-[15px] font-semibold text-gray-900">
                      {record.product.name} ({record.product.unit})
                    </h3>
                    <span className="text-[13px] text-gray-500 tabular-nums">
                      Thu hoạch {formatViDateTime(record.harvestDate)} ·{" "}
                      {record.plot.plotCode}
                    </span>
                    <Link
                      href={`/trace/${encodeURIComponent(record.batchCode)}`}
                      className="mt-auto inline-flex items-center justify-between border-t border-border-subtle pt-2.5 text-xs font-semibold text-brand-forest hover:underline focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:outline-none"
                    >
                      <span>Xem nhật ký</span>
                      <ArrowRight className="size-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

interface TraceLookupViewProps {
  readonly records: readonly RecentTraceBatchItem[];
}

/**
 * Interactive QR traceability lookup landing view wired to `lookupTraceBatchAction`.
 *
 * @param props Recent active batch summaries loaded from `GET /api/v1/trace`.
 * @returns Interactive lookup container updating preview/error inline.
 */
export function TraceLookupView({ records }: TraceLookupViewProps) {
  const [batchCode, setBatchCode] = useState("");
  const [previewRecord, setPreviewRecord] =
    useState<RecentTraceBatchItem | null>(null);
  const [notFoundCode, setNotFoundCode] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = batchCode.trim().toUpperCase();
    if (!normalized) {
      setPreviewRecord(null);
      setNotFoundCode(null);
      setLookupError("Vui lòng nhập mã lô để tra cứu.");
      return;
    }

    startTransition(async () => {
      const result = await lookupTraceBatchAction(normalized);
      if (result.ok) {
        setPreviewRecord(toRecentTracePreview(result.data));
        setNotFoundCode(null);
        setLookupError(null);
        return;
      }

      setPreviewRecord(null);
      if (result.reason === "not_found") {
        setNotFoundCode(normalized);
        setLookupError(null);
      } else {
        setNotFoundCode(null);
        setLookupError(result.message);
      }
    });
  }

  return (
    <TraceLookupContent
      records={records}
      batchCode={batchCode}
      previewRecord={previewRecord}
      notFoundCode={notFoundCode}
      lookupError={lookupError}
      isPending={isPending}
      onBatchCodeChange={setBatchCode}
      onSubmit={handleSubmit}
    />
  );
}

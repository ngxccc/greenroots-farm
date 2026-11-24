import Link from "next/link";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  buttonVariants,
} from "@greenroots/ui";
import { AlertCircle, ArrowLeft } from "lucide-react";
import {
  BATCH_STATUS_LABELS,
  FARMING_ACTION_LABELS,
  SEASON_STATUS_LABELS,
} from "@/constants/domain-labels.constant";
import { TraceProductImage } from "@/features/traceability/components/trace-product-image";
import { VietGapDialogButton } from "@/features/traceability/components/vietgap-dialog-button";
import { formatViDate, formatViDateTime } from "@/lib/format";
import { filterApprovedProductImages } from "@/lib/image-url";
import type { TraceRecord } from "@/types/trace.types";

interface TraceViewProps {
  readonly record?: TraceRecord;
  readonly batchCode: string;
  readonly errorMessage?: string;
}

/**
 * Renders the flat, divider-driven public QR batch traceability dossier (`/trace/[batchCode]`)
 * backed by real `TraceRecordDto` data without exposing internal staff identities.
 *
 * @param props Traceability record, requested batch code, and optional transient error message.
 * @returns Public batch traceability dossier or error fallback alert.
 */
export function TraceView({ record, batchCode, errorMessage }: TraceViewProps) {
  if (!record) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <Alert variant="destructive" className="rounded-lg p-6">
          <AlertCircle className="size-5" aria-hidden="true" />
          <AlertTitle className="text-base font-bold">
            {errorMessage ?? `Không tìm thấy mã lô ${batchCode}`}
          </AlertTitle>
          <AlertDescription className="mt-1 space-y-3 text-[13px]">
            <p>
              Vui lòng kiểm tra lại tem QR trên bao bì nông sản hoặc quay lại
              trang tra cứu để chọn lô thu hoạch khác.
            </p>
            <Link
              href="/trace"
              className={buttonVariants({
                className:
                  "bg-brand-forest font-semibold text-white hover:bg-brand-dark",
              })}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Quay lại tra cứu QR
            </Link>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const productImageUrl = filterApprovedProductImages(
    record.product.imageUrls,
  )[0];
  const soilTest = record.plot.soilTestResult;
  const waterTest = record.plot.waterTestResult;
  const isExpired = record.batch.status === "expired";

  const labChecks = [
    soilTest ? soilTest.ph >= 5.5 && soilTest.ph <= 7.5 : null,
    soilTest ? soilTest.heavy_metals.pass : null,
    waterTest ? waterTest.ph >= 6.0 && waterTest.ph <= 8.5 : null,
    waterTest ? waterTest.heavy_metals_pass : null,
  ];
  const availableChecks = labChecks.filter((item) => item !== null);
  const passedChecks = availableChecks.filter(Boolean).length;

  // Reverse ascending API timeline so the most recent harvest/correction appears first.
  const timelineLogs = record.farmingLogs.toReversed();

  const metadataItems = [
    {
      label: "Mã lô thu hoạch",
      value: record.batch.batchCode,
      cellClassName: "lg:pr-4",
      valueClassName: "text-[13px] font-medium text-gray-900 tabular-nums",
    },
    {
      label: "Ngày thu hoạch",
      value: formatViDateTime(record.batch.harvestDate),
      cellClassName: "lg:px-4",
      valueClassName: "text-[15px] font-semibold text-gray-900 tabular-nums",
    },
    {
      label: "Hạn sử dụng tốt nhất",
      value: `${formatViDate(record.batch.expirationDate)} (${BATCH_STATUS_LABELS[record.batch.status]})`,
      cellClassName: "lg:px-4",
      valueClassName: `text-[15px] font-semibold tabular-nums ${
        isExpired ? "text-red-700" : "text-gray-900"
      }`,
    },
    {
      label: "Lô đất & Mùa vụ",
      value: `${record.plot.plotCode} · ${record.season.seasonName}`,
      cellClassName: "lg:pl-4",
      valueClassName: "text-[15px] font-semibold text-gray-900",
    },
  ];

  const plotInfoRows = [
    { label: "Đơn vị sản xuất", value: record.farm.legalName, tabular: false },
    {
      label: "Thửa canh tác",
      value: `${record.plot.plotCode} · ${record.plot.name} (${record.plot.areaSqm} m²)`,
      tabular: true,
    },
    {
      label: "Mùa vụ",
      value: `${record.season.seasonName} (${SEASON_STATUS_LABELS[record.season.status]})`,
      tabular: false,
    },
    {
      label: "Thời gian vụ",
      value: `${formatViDate(record.season.startDate)} – ${formatViDate(record.season.expectedHarvestDate)}`,
      tabular: true,
    },
  ];

  const labMetricRows = [
    {
      label: "Độ pH giá thể đất",
      detail: "Chuẩn canh tác: 5.5 – 7.5",
      value: soilTest ? `${soilTest.ph} pH` : "Chưa cập nhật",
      isWarning: false,
      tabular: true,
    },
    {
      label: "Kim loại nặng trong đất (Pb, Cd)",
      detail: soilTest
        ? `Pb ${soilTest.heavy_metals.lead_ppm} ppm · Cd ${soilTest.heavy_metals.cadmium_ppm} ppm`
        : "Chưa có số liệu phòng lab",
      value: soilTest
        ? soilTest.heavy_metals.pass
          ? "Đạt chuẩn"
          : "Cảnh báo"
        : "Chưa cập nhật",
      isWarning: Boolean(soilTest && !soilTest.heavy_metals.pass),
      tabular: false,
    },
    {
      label: "Nước tưới (pH & độ dẫn điện EC)",
      detail: waterTest
        ? `EC ${waterTest.ec_ms_cm} mS/cm · DO ${waterTest.dissolved_oxygen_ppm} ppm`
        : "Chưa có số liệu nước tưới",
      value: waterTest ? `${waterTest.ph} pH` : "Chưa cập nhật",
      isWarning: false,
      tabular: true,
    },
    {
      label: "Vi sinh & kim loại nặng nước tưới",
      detail: waterTest
        ? `E.coli ${waterTest.e_coli_cfu_100ml} CFU/100ml`
        : "Chưa có số liệu vi sinh",
      value: waterTest
        ? waterTest.heavy_metals_pass
          ? "Đạt chuẩn"
          : "Cảnh báo"
        : "Chưa cập nhật",
      isWarning: Boolean(waterTest && !waterTest.heavy_metals_pass),
      tabular: false,
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 lg:px-6">
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
            <BreadcrumbLink
              render={<Link href="/trace" />}
              className="hover:text-brand-forest"
            >
              Tra cứu nguồn gốc QR
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-semibold text-gray-900 tabular-nums">
              {record.batch.batchCode}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <section
        aria-label="Thông tin lô hàng"
        className="flex flex-col gap-6 border-b border-border-subtle pb-6"
      >
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="flex items-start gap-4">
            <TraceProductImage
              src={productImageUrl}
              alt={`${record.product.name} lô ${record.batch.batchCode}`}
              width={80}
              height={80}
              loading="eager"
              className="size-20 shrink-0 rounded-md bg-green-50 object-cover"
              fallbackClassName="flex size-20 shrink-0 items-center justify-center rounded-md bg-green-50 text-brand-forest"
              iconClassName="size-9"
            />

            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-medium text-gray-500 tabular-nums">
                  {record.batch.batchCode}
                </span>
              </div>
              <h1 className="text-[22px] leading-tight font-bold text-gray-900 md:text-[28px]">
                {record.product.name} ({record.product.unit})
              </h1>
              <p className="text-[13px] text-gray-500">
                {record.farm.name} ({record.farm.address}) — Dữ liệu ghi nhận
                trực tiếp từ vườn và không thể chỉnh sửa xóa bỏ.
              </p>
            </div>
          </div>

          {record.farm.certificationUrl ? (
            <VietGapDialogButton
              farmName={record.farm.name}
              legalName={record.farm.legalName}
              address={record.farm.address}
              certificationUrl={record.farm.certificationUrl}
            />
          ) : null}
        </div>

        <div className="grid grid-cols-2 divide-y divide-border-subtle border-t border-border-subtle pt-4 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
          {metadataItems.map((item) => (
            <div
              key={item.label}
              className={`flex flex-col gap-1 py-1 ${item.cellClassName}`}
            >
              <span className="text-[11px] font-semibold text-gray-500">
                {item.label}
              </span>
              <span className={item.valueClassName}>{item.value}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 items-start gap-6 border-b border-border-subtle pb-6 lg:grid-cols-12">
        <section
          aria-label="Hồ sơ thửa đất và mùa vụ"
          className="flex flex-col gap-4 lg:col-span-5"
        >
          <h2 className="text-lg font-bold text-gray-900">
            Hồ sơ thửa đất &amp; Mùa vụ
          </h2>

          <div className="flex flex-col divide-y divide-border-subtle border-t border-border-subtle text-[13px]">
            {plotInfoRows.map((row) => (
              <div
                key={row.label}
                className="flex justify-between gap-4 py-2.5"
              >
                <span className="text-gray-500">{row.label}</span>
                <span
                  className={`text-right font-semibold text-gray-900 ${
                    row.tabular ? "tabular-nums" : ""
                  }`}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section
          aria-label="Kết quả kiểm nghiệm đất và nước"
          className="flex flex-col gap-4 lg:col-span-7 lg:border-l lg:border-border-subtle lg:pl-6"
        >
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-bold text-gray-900">
              Kết quả kiểm nghiệm đất &amp; nước
            </h2>
            <p className="shrink-0 text-xs font-semibold text-gray-500 tabular-nums">
              {availableChecks.length > 0
                ? `Đạt ${passedChecks}/${availableChecks.length} chỉ tiêu`
                : "Chưa có kết quả"}
            </p>
          </div>

          <div className="flex flex-col divide-y divide-border-subtle border-t border-border-subtle">
            {labMetricRows.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between gap-4 py-2.5"
              >
                <div className="flex flex-col">
                  <span className="text-[13px] font-semibold text-gray-900">
                    {row.label}
                  </span>
                  <span className="text-xs text-gray-500 tabular-nums">
                    {row.detail}
                  </span>
                </div>
                <span
                  className={`shrink-0 text-right text-[13px] font-semibold ${
                    row.tabular ? "tabular-nums" : ""
                  } ${row.isWarning ? "text-red-700" : "text-gray-900"}`}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section
        aria-label="Timeline nhật ký canh tác bất biến"
        className="flex flex-col gap-6"
      >
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <h2 className="text-lg font-bold text-balance text-gray-900">
            Timeline nhật ký canh tác bất biến ({record.totalLogCount} mốc)
          </h2>
          <span className="text-[13px] text-gray-500">
            Mọi bản ghi chỉ được thêm mới, giữ nguyên lịch sử đính chính.
          </span>
        </div>

        {record.logsTruncated ? (
          <p className="text-xs text-gray-500">
            Đang hiển thị {record.farmingLogs.length} mốc gần nhất trong tổng số{" "}
            {record.totalLogCount} bản ghi.
          </p>
        ) : null}

        {timelineLogs.length === 0 ? (
          <p className="rounded-lg border border-border-subtle bg-surface-warm p-6 text-center text-[13px] text-gray-500">
            Chưa có nhật ký canh tác nào được ghi nhận cho mùa vụ này.
          </p>
        ) : (
          <ol className="ml-2 flex flex-col gap-4 border-l-2 border-border-subtle pl-6">
            {timelineLogs.map((entry) => {
              const isCorrection = entry.correctsLog !== null;
              const isSuperseded = entry.correctedBy.length > 0;
              const shortRef = `#${entry.id.slice(-6)}`;

              return (
                <li
                  key={entry.id}
                  className={
                    isCorrection
                      ? "relative flex flex-col gap-1 rounded-md bg-surface-warm p-4"
                      : "relative flex flex-col gap-1"
                  }
                >
                  <span
                    className={`absolute -left-7.75 h-3 w-3 rounded-full ${
                      isCorrection
                        ? "top-4 bg-gray-500"
                        : isSuperseded
                          ? "top-1.5 bg-gray-500"
                          : "top-1.5 bg-brand-forest"
                    }`}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-xs font-semibold tabular-nums ${
                        isCorrection || isSuperseded
                          ? "text-gray-900"
                          : "text-brand-dark"
                      }`}
                    >
                      {formatViDateTime(entry.loggedAt)}
                    </span>

                    {isCorrection ? (
                      <Badge className="h-auto rounded-full border border-border-subtle bg-surface-card px-2.5 py-0.5 text-[11px] font-semibold text-gray-900">
                        Bản ghi đính chính
                      </Badge>
                    ) : isSuperseded ? (
                      <Badge className="h-auto rounded-full border-0 bg-surface-warm px-2 py-0.5 text-[11px] font-semibold text-gray-900">
                        Đã được đính chính
                      </Badge>
                    ) : (
                      <Badge className="h-auto rounded-full border-0 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-brand-dark">
                        {FARMING_ACTION_LABELS[entry.actionType]}
                      </Badge>
                    )}

                    <span className="text-[13px] font-medium text-gray-500 tabular-nums">
                      {shortRef}
                    </span>
                  </div>

                  <p
                    className={`text-[13px] leading-relaxed ${
                      isSuperseded
                        ? "text-gray-500 line-through"
                        : "text-gray-900"
                    }`}
                  >
                    {entry.description}
                  </p>

                  {entry.correctsLog ? (
                    <p className="text-xs text-gray-500 tabular-nums">
                      Đính chính cho bản ghi #{entry.correctsLog.id.slice(-6)} (
                      {FARMING_ACTION_LABELS[entry.correctsLog.actionType]} ·{" "}
                      {formatViDateTime(entry.correctsLog.loggedAt)})
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from "@greenroots/ui";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { api, extractApiErrorMessage } from "@/lib/api-client";
import {
  buildOperationsAnalyticsQuery,
  formatInteger,
  formatVnd,
  formatWasteRatioPercent,
  GRANULARITY_LABELS,
  type OperationsAnalyticsDto,
  type OperationsGranularity,
  type OperationsPeriodPreset,
  PERIOD_PRESET_LABELS,
  resolvePeriodRange,
} from "../analytics-utils";
import { OperationsCharts } from "./operations-charts";
import { TopProductsTable } from "./top-products-table";

const PRESET_OPTIONS: readonly OperationsPeriodPreset[] = [
  "7d",
  "30d",
  "90d",
  "custom",
];

const GRANULARITY_OPTIONS: readonly OperationsGranularity[] = [
  "day",
  "week",
  "month",
];

/**
 * Operational analytics dashboard fetching exclusively `GET /api/v1/analytics/operations`.
 */
export function OperationsAnalyticsView() {
  const initialRange = useMemo(() => resolvePeriodRange("30d"), []);
  const [preset, setPreset] = useState<OperationsPeriodPreset>("30d");
  const [granularity, setGranularity] = useState<OperationsGranularity>("day");
  const [customFrom, setCustomFrom] = useState<string>(initialRange.from);
  const [customTo, setCustomTo] = useState<string>(initialRange.to);

  const queryParams = useMemo(
    () =>
      buildOperationsAnalyticsQuery({
        preset,
        from: customFrom,
        to: customTo,
        granularity,
        topLimit: 10,
      }),
    [preset, customFrom, customTo, granularity],
  );

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery<
    OperationsAnalyticsDto,
    unknown
  >({
    queryKey: ["analytics", "operations", queryParams],
    queryFn: async () => {
      const response = await api.GET("/api/v1/analytics/operations", {
        params: { query: queryParams },
      });
      if (response.error) {
        throw new Error(extractApiErrorMessage(response.error));
      }
      return response.data.data;
    },
  });

  const summary = data?.summary;

  return (
    <div className="flex w-full flex-col gap-6">
      <Card className="border-border-subtle bg-surface-card shadow-sm">
        <CardContent className="flex flex-col gap-4 pt-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="analytics-period-select">Khoảng thời gian</Label>
              <Select
                value={preset}
                onValueChange={(value) => {
                  if (value) {
                    setPreset(value);
                  }
                }}
              >
                <SelectTrigger
                  id="analytics-period-select"
                  className="w-full sm:w-44"
                  aria-label="Chọn khoảng thời gian"
                >
                  <SelectValue>{PERIOD_PRESET_LABELS[preset]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PRESET_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {PERIOD_PRESET_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {preset === "custom" ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="analytics-from-date">Từ ngày</Label>
                  <Input
                    id="analytics-from-date"
                    type="date"
                    value={customFrom}
                    max={customTo || undefined}
                    onChange={(event) => setCustomFrom(event.target.value)}
                    className="w-full tabular-nums sm:w-40"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="analytics-to-date">Đến ngày</Label>
                  <Input
                    id="analytics-to-date"
                    type="date"
                    value={customTo}
                    min={customFrom || undefined}
                    onChange={(event) => setCustomTo(event.target.value)}
                    className="w-full tabular-nums sm:w-40"
                  />
                </div>
              </>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="analytics-granularity-select">Nhóm theo</Label>
              <Select
                value={granularity}
                onValueChange={(value) => {
                  if (value) {
                    setGranularity(value);
                  }
                }}
              >
                <SelectTrigger
                  id="analytics-granularity-select"
                  className="w-full sm:w-40"
                  aria-label="Chọn đơn vị nhóm thời gian"
                >
                  <SelectValue>{GRANULARITY_LABELS[granularity]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {GRANULARITY_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {GRANULARITY_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 lg:justify-end">
            {data?.period ? (
              <span className="text-xs text-gray-500 tabular-nums">
                Kỳ: {data.period.from} → {data.period.to}
              </span>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void refetch();
              }}
              disabled={isFetching}
            >
              <RefreshCw
                className={
                  isFetching ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"
                }
                aria-hidden="true"
              />
              Làm mới
            </Button>
          </div>
        </CardContent>
      </Card>

      {isError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Không thể tải báo cáo vận hành</AlertTitle>
          <AlertDescription>
            {extractApiErrorMessage(
              error,
              "Đã xảy ra lỗi khi tải dữ liệu vận hành. Vui lòng thử lại.",
            )}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border-subtle bg-surface-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-gray-500 uppercase">
              Doanh thu gộp
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold text-gray-900 tabular-nums">
                {formatVnd(summary?.grossItemRevenueVnd ?? 0)}
              </div>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Tính trên đơn đã giao thành công
            </p>
          </CardContent>
        </Card>

        <Card className="border-border-subtle bg-surface-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-gray-500 uppercase">
              Đơn hàng đã giao
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold text-gray-900 tabular-nums">
                {formatInteger(summary?.deliveredOrderCount ?? 0)}
              </div>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Tổng số đơn hoàn tất giao hàng
            </p>
          </CardContent>
        </Card>

        <Card className="border-border-subtle bg-surface-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-gray-500 uppercase">
              Tỷ lệ hao hụt
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold text-brand-dark tabular-nums">
                {formatWasteRatioPercent(summary?.wasteRatio ?? 0)}
              </div>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Lượng xuất hủy / tổng nhập kho
            </p>
          </CardContent>
        </Card>

        <Card className="border-border-subtle bg-surface-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-gray-500 uppercase">
              Nhập kho &amp; Xuất hủy
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="flex items-baseline gap-2 text-2xl font-bold text-gray-900 tabular-nums">
                <span>{formatInteger(summary?.totalInitialQuantity ?? 0)}</span>
                <span className="text-sm font-medium text-gray-400">/</span>
                <span className="text-status-spoiled">
                  {formatInteger(summary?.totalDiscardedQuantity ?? 0)}
                </span>
              </div>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Tổng đơn vị nhập / đã xuất hủy
            </p>
          </CardContent>
        </Card>
      </div>

      <OperationsCharts
        revenueSeries={data?.revenueSeries ?? []}
        wasteSeries={data?.wasteSeries ?? []}
        isLoading={isLoading}
      />

      <TopProductsTable
        products={data?.topProducts ?? []}
        isLoading={isLoading}
      />
    </div>
  );
}

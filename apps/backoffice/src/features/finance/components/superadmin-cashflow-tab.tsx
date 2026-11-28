import {
  Alert,
  AlertDescription,
  AlertTitle,
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
  Skeleton,
} from "@greenroots/ui";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuthStore } from "@/features/auth/stores/auth.store";
import { fetchFinanceAnalytics, FINANCE_QUERY_KEYS } from "../finance.api";
import {
  canViewSuperAdminCashflow,
  CASHFLOW_GRANULARITY_OPTIONS,
  formatCashflowBucketLabel,
  formatCompactVnd,
  formatVnd,
  getDefaultCashflowDateRange,
  type CashflowGranularity,
} from "../finance.utils";

/**
 * SuperAdmin-only cashflow analytics view powered by `GET /api/v1/analytics/finance`.
 * Query execution is strictly gated on `user.role === "super_admin"`.
 */
export function SuperAdminCashflowTab() {
  const userRole = useAuthStore((state) => state.user?.role);
  const isSuperAdmin = canViewSuperAdminCashflow(userRole);

  const initialRange = useMemo(() => getDefaultCashflowDateRange(30), []);
  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);
  const [granularity, setGranularity] = useState<CashflowGranularity>("day");

  const queryParams = useMemo(
    () => ({
      from: fromDate,
      to: toDate,
      granularity,
    }),
    [fromDate, toDate, granularity],
  );

  // Security gate: prevent non-super_admin roles from ever issuing the finance analytics request.
  const cashflowQuery = useQuery({
    queryKey: FINANCE_QUERY_KEYS.cashflow(queryParams),
    queryFn: () => fetchFinanceAnalytics(queryParams),
    enabled: isSuperAdmin,
  });

  if (!isSuperAdmin) {
    return null;
  }

  const activeGranularityLabel =
    CASHFLOW_GRANULARITY_OPTIONS.find((opt) => opt.value === granularity)
      ?.label ?? "Theo ngày";

  const chartData = (cashflowQuery.data?.cashflowSeries ?? []).map((point) => ({
    ...point,
    label: formatCashflowBucketLabel(point.bucket, granularity),
    totalOutflowVnd: point.payosOutflowVnd + point.codOutflowVnd,
  }));

  const summary = cashflowQuery.data?.summary;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cashflow-from">Từ ngày</Label>
            <Input
              id="cashflow-from"
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="w-40 tabular-nums"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cashflow-to">Đến ngày</Label>
            <Input
              id="cashflow-to"
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="w-40 tabular-nums"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cashflow-granularity">Chu kỳ gộp</Label>
            <div className="w-40">
              <Select
                value={granularity}
                onValueChange={(value) => {
                  if (value) setGranularity(value);
                }}
              >
                <SelectTrigger
                  id="cashflow-granularity"
                  aria-label="Chọn chu kỳ gộp dòng tiền"
                >
                  <SelectValue>{activeGranularityLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {CASHFLOW_GRANULARITY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[7, 30, 90].map((days) => (
            <Button
              key={days}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const range = getDefaultCashflowDateRange(days);
                setFromDate(range.from);
                setToDate(range.to);
              }}
            >
              {days} ngày
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void cashflowQuery.refetch()}
            disabled={cashflowQuery.isFetching}
            className="gap-1.5"
          >
            <RefreshCw
              className={
                cashflowQuery.isFetching ? "size-4 animate-spin" : "size-4"
              }
              aria-hidden="true"
            />
            <span>Cập nhật</span>
          </Button>
        </div>
      </div>

      {cashflowQuery.error ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertTitle>Không thể tải báo cáo dòng tiền</AlertTitle>
          <AlertDescription>
            {cashflowQuery.error instanceof Error
              ? cashflowQuery.error.message
              : "Đã có lỗi xảy ra khi tải số liệu dòng tiền."}
          </AlertDescription>
        </Alert>
      ) : null}

      {cashflowQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : summary ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-border-subtle bg-surface-card shadow-sm">
            <CardHeader className="pb-2">
              <CardDescription>Dòng tiền thuần</CardDescription>
              <CardTitle className="text-2xl text-brand-dark tabular-nums">
                {formatVnd(summary.netCashflowVnd)}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-gray-500 tabular-nums">
              Tổng thu {formatVnd(summary.totalInflowVnd)} · Hoàn{" "}
              {formatVnd(summary.totalOutflowVnd)}
            </CardContent>
          </Card>

          <Card className="border-border-subtle bg-surface-card shadow-sm">
            <CardHeader className="pb-2">
              <CardDescription>Thu qua PayOS</CardDescription>
              <CardTitle className="text-2xl text-gray-900 tabular-nums">
                {formatVnd(summary.payosInflowVnd)}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-gray-500 tabular-nums">
              Đơn lẻ {formatVnd(summary.payosOrderInflowVnd)} · Gói{" "}
              {formatVnd(summary.payosSubscriptionInflowVnd)}
            </CardContent>
          </Card>

          <Card className="border-border-subtle bg-surface-card shadow-sm">
            <CardHeader className="pb-2">
              <CardDescription>Thu tiền mặt COD</CardDescription>
              <CardTitle className="text-2xl text-gray-900 tabular-nums">
                {formatVnd(summary.codInflowVnd)}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-gray-500 tabular-nums">
              COD thuần: {formatVnd(summary.codNetVnd)}
            </CardContent>
          </Card>

          <Card className="border-border-subtle bg-surface-card shadow-sm">
            <CardHeader className="pb-2">
              <CardDescription>Công nợ COD chờ thu</CardDescription>
              <CardTitle className="text-2xl text-amber-700 tabular-nums">
                {formatVnd(summary.pendingCodReceivableVnd)}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-gray-500">
              Giá trị các đơn COD đang giao / chưa đối soát
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border-subtle bg-surface-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">
              So sánh dòng tiền vào PayOS vs COD &amp; Hoàn tiền
            </CardTitle>
            <CardDescription>
              Số liệu thực thu/chi theo ngày thanh toán (Asia/Ho_Chi_Minh)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {cashflowQuery.isLoading ? (
              <Skeleton className="h-80 w-full" />
            ) : chartData.length === 0 ? (
              <div className="flex h-80 items-center justify-center text-sm text-gray-500">
                Chưa có phát sinh dòng tiền trong khoảng thời gian đã chọn.
              </div>
            ) : (
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 8, right: 12, left: 4, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis
                      tickFormatter={(val) => formatCompactVnd(Number(val))}
                      tick={{ fontSize: 12 }}
                      width={64}
                    />
                    <Tooltip
                      formatter={(value) => formatVnd(Number(value ?? 0))}
                    />
                    <Legend />
                    <Bar
                      dataKey="payosInflowVnd"
                      name="Thu PayOS"
                      fill="#15803d"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="codInflowVnd"
                      name="Thu COD"
                      fill="#0284c7"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="totalOutflowVnd"
                      name="Chi hoàn tiền"
                      fill="#dc2626"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border-subtle bg-surface-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">
              Biến động dòng tiền thuần theo kỳ
            </CardTitle>
            <CardDescription>
              Tổng dòng tiền thuần và dòng tiền thuần qua kênh PayOS
            </CardDescription>
          </CardHeader>
          <CardContent>
            {cashflowQuery.isLoading ? (
              <Skeleton className="h-80 w-full" />
            ) : chartData.length === 0 ? (
              <div className="flex h-80 items-center justify-center text-sm text-gray-500">
                Chưa có phát sinh dòng tiền trong khoảng thời gian đã chọn.
              </div>
            ) : (
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={chartData}
                    margin={{ top: 8, right: 12, left: 4, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis
                      tickFormatter={(val) => formatCompactVnd(Number(val))}
                      tick={{ fontSize: 12 }}
                      width={64}
                    />
                    <Tooltip
                      formatter={(value) => formatVnd(Number(value ?? 0))}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="netCashflowVnd"
                      name="Dòng tiền thuần"
                      stroke="#15803d"
                      fill="#dcfce7"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="payosNetVnd"
                      name="PayOS thuần"
                      stroke="#0284c7"
                      fill="#e0f2fe"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

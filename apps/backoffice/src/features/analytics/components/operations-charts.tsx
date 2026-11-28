import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@greenroots/ui";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  formatCompactVnd,
  formatInteger,
  formatVnd,
  formatWasteRatioPercent,
  type OperationsAnalyticsDto,
} from "../analytics-utils";

interface OperationsChartsProps {
  readonly revenueSeries: OperationsAnalyticsDto["revenueSeries"];
  readonly wasteSeries: OperationsAnalyticsDto["wasteSeries"];
  readonly isLoading: boolean;
}

/**
 * Renders the operational revenue and harvest-cohort waste charts using `recharts`.
 */
export function OperationsCharts({
  revenueSeries,
  wasteSeries,
  isLoading,
}: OperationsChartsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-border-subtle bg-surface-card shadow-sm">
          <CardHeader>
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-72 w-full" />
          </CardContent>
        </Card>
        <Card className="border-border-subtle bg-surface-card shadow-sm">
          <CardHeader>
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-72 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card className="border-border-subtle bg-surface-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-bold text-gray-900">
            Doanh thu gộp theo thời gian
          </CardTitle>
          <CardDescription>
            Tổng giá trị hàng hóa từ các đơn hàng đã giao thành công.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {revenueSeries.length === 0 ? (
            <div className="flex h-72 items-center justify-center text-sm text-gray-500">
              Chưa có dữ liệu doanh thu trong khoảng thời gian đã chọn.
            </div>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={revenueSeries}
                  margin={{ top: 8, right: 12, left: 4, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="grossRevenueFill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="#15803d"
                        stopOpacity={0.28}
                      />
                      <stop offset="95%" stopColor="#15803d" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="4 4"
                    vertical={false}
                    stroke="#e5e7eb"
                  />
                  <XAxis
                    dataKey="bucket"
                    tick={{ fontSize: 12, fill: "#6b7280" }}
                    tickLine={false}
                    axisLine={{ stroke: "#e5e7eb" }}
                  />
                  <YAxis
                    tickFormatter={(value: number) => formatCompactVnd(value)}
                    tick={{ fontSize: 12, fill: "#6b7280" }}
                    tickLine={false}
                    axisLine={false}
                    width={64}
                  />
                  <Tooltip
                    formatter={(value) => [
                      formatVnd(Number(value ?? 0)),
                      "Doanh thu gộp",
                    ]}
                    labelFormatter={(label) =>
                      `Kỳ: ${typeof label === "string" || typeof label === "number" ? label : ""}`
                    }
                    contentStyle={{
                      borderRadius: "8px",
                      borderColor: "#e5e7eb",
                      fontSize: "12px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="grossItemRevenueVnd"
                    name="Doanh thu gộp"
                    stroke="#15803d"
                    strokeWidth={2.5}
                    fill="url(#grossRevenueFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border-subtle bg-surface-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-bold text-gray-900">
            Sản lượng nhập &amp; xuất hủy theo lô
          </CardTitle>
          <CardDescription>
            Đối chiếu sản lượng thu hoạch ban đầu và lượng hao hụt đã duyệt hủy.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {wasteSeries.length === 0 ? (
            <div className="flex h-72 items-center justify-center text-sm text-gray-500">
              Chưa có dữ liệu lô thu hoạch trong khoảng thời gian đã chọn.
            </div>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={wasteSeries}
                  margin={{ top: 8, right: 12, left: 4, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="4 4"
                    vertical={false}
                    stroke="#e5e7eb"
                  />
                  <XAxis
                    dataKey="bucket"
                    tick={{ fontSize: 12, fill: "#6b7280" }}
                    tickLine={false}
                    axisLine={{ stroke: "#e5e7eb" }}
                  />
                  <YAxis
                    tickFormatter={(value: number) => formatInteger(value)}
                    tick={{ fontSize: 12, fill: "#6b7280" }}
                    tickLine={false}
                    axisLine={false}
                    width={52}
                  />
                  <Tooltip
                    formatter={(value, name, item) => {
                      if (name === "discardedQuantity") {
                        const ratio = (
                          item.payload as { wasteRatio?: number } | undefined
                        )?.wasteRatio;
                        const suffix =
                          typeof ratio === "number"
                            ? ` (${formatWasteRatioPercent(ratio)})`
                            : "";
                        return [
                          `${formatInteger(Number(value ?? 0))}${suffix}`,
                          "Đã xuất hủy",
                        ];
                      }
                      return [
                        formatInteger(Number(value ?? 0)),
                        "Nhập kho ban đầu",
                      ];
                    }}
                    labelFormatter={(label) =>
                      `Kỳ: ${typeof label === "string" || typeof label === "number" ? label : ""}`
                    }
                    contentStyle={{
                      borderRadius: "8px",
                      borderColor: "#e5e7eb",
                      fontSize: "12px",
                    }}
                  />
                  <Bar
                    dataKey="initialQuantity"
                    name="initialQuantity"
                    fill="#15803d"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="discardedQuantity"
                    name="discardedQuantity"
                    fill="#dc2626"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

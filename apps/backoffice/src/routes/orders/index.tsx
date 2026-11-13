import {
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  type OrderStatus,
  type PaymentMethod,
} from "@greenroots/shared";
import { Badge, Button, Card, CardContent, toast } from "@greenroots/ui";
import { createFileRoute } from "@tanstack/react-router";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Printer, Zap } from "lucide-react";

export const Route = createFileRoute("/orders/")({
  component: OrdersFefoPage,
});

interface DemoOrderRow {
  readonly id: string;
  readonly orderCode: string;
  readonly customerName: string;
  readonly totalVnd: number;
  readonly codVnd: number;
  readonly isSubscription: boolean;
  readonly paymentMethod: PaymentMethod;
  readonly status: OrderStatus;
  readonly fefoBatch: string;
}

const DEMO_ORDERS: readonly DemoOrderRow[] = [
  {
    id: "ord-1",
    orderCode: "GR-2026-1041",
    customerName: "Chị Lan Anh (Q.2)",
    totalVnd: 185_000,
    codVnd: 0,
    isSubscription: true,
    paymentMethod: "payos",
    status: "pending_confirmation",
    fefoBatch: "BATCH-2026-1112-A1 (HSD 18h)",
  },
  {
    id: "ord-2",
    orderCode: "GR-2026-1042",
    customerName: "Anh Minh Tuấn (Q.7)",
    totalVnd: 142_000,
    codVnd: 142_000,
    isSubscription: false,
    paymentMethod: "cod",
    status: "packing",
    fefoBatch: "BATCH-2026-1113-B2 (HSD 36h)",
  },
];

const columnHelper = createColumnHelper<DemoOrderRow>();

const columns = [
  columnHelper.accessor("orderCode", {
    header: "Mã đơn",
    cell: (info) => (
      <span className="font-bold text-gray-900">{info.getValue()}</span>
    ),
  }),
  columnHelper.accessor("customerName", {
    header: "Khách hàng",
  }),
  columnHelper.accessor("fefoBatch", {
    header: "Lô đề xuất (FEFO)",
    cell: (info) => (
      <span className="text-xs font-semibold text-brand-forest">
        {info.getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("paymentMethod", {
    header: "Thanh toán / COD",
    cell: (info) => {
      const row = info.row.original;
      return (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-600">
            {PAYMENT_METHOD_LABELS[info.getValue()]}
          </span>
          {row.isSubscription ? (
            <Badge variant="secondary" className="text-[11px]">
              Gói định kỳ · COD 0đ
            </Badge>
          ) : null}
        </div>
      );
    },
  }),
  columnHelper.accessor("status", {
    header: "Trạng thái",
    cell: (info) => (
      <Badge variant="outline">{ORDER_STATUS_LABELS[info.getValue()]}</Badge>
    ),
  }),
  columnHelper.display({
    id: "actions",
    header: "Thao tác",
    cell: (info) => {
      const row = info.row.original;
      return (
        <div className="flex items-center gap-2">
          <Button
            size="xs"
            onClick={() =>
              toast.success(
                `Đã phân bổ FEFO (${row.fefoBatch}) cho ${row.orderCode}`,
              )
            }
            className="gap-1 bg-brand-forest text-white hover:bg-brand-dark"
          >
            <Zap className="size-3.5" />
            <span>Phân bổ FEFO</span>
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => toast.info(`In phiếu giao hàng ${row.orderCode}`)}
            className="gap-1"
          >
            <Printer className="size-3.5" />
            <span>In phiếu</span>
          </Button>
        </div>
      );
    },
  }),
];

function OrdersFefoPage() {
  // oxlint-disable-next-line react/incompatible-library
  const table = useReactTable({
    data: [...DEMO_ORDERS],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-gray-900">
            Điều Phối Đơn &amp; Xuất Kho FEFO
          </h1>
          <p className="text-sm text-gray-500">
            BO-04 · Tự động gợi ý lô cận hạn nhất (First-Expired, First-Out)
          </p>
        </div>
        <Badge variant="secondary">TanStack Table</Badge>
      </div>

      <Card className="border-border-subtle bg-white shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border-subtle bg-gray-50 text-xs font-bold text-gray-600 uppercase">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th key={header.id} className="px-4 py-3">
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50/70">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

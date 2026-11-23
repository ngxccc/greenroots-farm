import {
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  type OrderStatus,
  type PaymentMethod,
} from "@greenroots/shared";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@greenroots/ui";
import { createFileRoute } from "@tanstack/react-router";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { CheckCircle2, Printer, Zap } from "lucide-react";
import { useMemo, useState } from "react";

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

function createOrderColumns(handlers: {
  readonly onAllocate: (row: DemoOrderRow) => void;
  readonly onPrint: (row: DemoOrderRow) => void;
}) {
  return [
    columnHelper.accessor("orderCode", {
      header: "Mã đơn",
      cell: (info) => (
        <span className="font-bold text-gray-900 tabular-nums">
          {info.getValue()}
        </span>
      ),
    }),
    columnHelper.accessor("customerName", {
      header: "Khách hàng",
    }),
    columnHelper.accessor("fefoBatch", {
      header: "Lô đề xuất (FEFO)",
      cell: (info) => (
        <span className="text-xs font-semibold text-brand-forest tabular-nums">
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
              type="button"
              size="xs"
              onClick={() => handlers.onAllocate(row)}
              className="gap-1"
            >
              <Zap className="size-3.5" aria-hidden="true" />
              <span>Phân bổ FEFO</span>
            </Button>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => handlers.onPrint(row)}
              className="gap-1"
            >
              <Printer className="size-3.5" aria-hidden="true" />
              <span>In phiếu</span>
            </Button>
          </div>
        );
      },
    }),
  ];
}

function OrdersFefoPage() {
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const columns = useMemo(
    () =>
      createOrderColumns({
        onAllocate: (row) =>
          setActionNotice(
            `Đã phân bổ FEFO (${row.fefoBatch}) cho ${row.orderCode}`,
          ),
        onPrint: (row) =>
          setActionNotice(`In phiếu giao hàng ${row.orderCode}`),
      }),
    [],
  );

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

      {actionNotice ? (
        <Alert variant="success">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          <AlertDescription>{actionNotice}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="border-border-subtle bg-surface-card shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-gray-50 text-xs font-bold text-gray-600 uppercase">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className="h-auto px-4 py-3 font-bold text-gray-600"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="hover:bg-gray-50/70">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="px-4 py-3">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

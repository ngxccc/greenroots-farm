import {
  PAYMENT_METHOD_LABELS,
  PaymentTransactionType,
} from "@greenroots/shared";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from "@greenroots/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useAuthStore } from "@/features/auth/stores/auth.store";
import { fetchPaymentLedger, FINANCE_QUERY_KEYS } from "../finance.api";
import {
  canConfirmCodPayment,
  formatSignedLedgerAmount,
  formatViDateTime,
  formatVnd,
  getReconciliationBadge,
  PAYMENT_METHOD_FILTER_OPTIONS,
  PAYMENT_STATUS_BADGE_CLASSES,
  PAYMENT_STATUS_FILTER_OPTIONS,
  PAYMENT_STATUS_LABELS,
  TRANSACTION_TYPE_FILTER_OPTIONS,
  TRANSACTION_TYPE_LABELS,
  type PaymentLedgerItemDto,
  type PaymentMethodFilter,
  type PaymentStatusFilter,
  type PaymentTransactionTypeFilter,
} from "../finance.utils";
import { CodConfirmDialog } from "./cod-confirm-dialog";

const columnHelper = createColumnHelper<PaymentLedgerItemDto>();
const PAGE_SIZE = 20;

interface CreatePaymentColumnsOptions {
  readonly userRole: ReturnType<
    typeof useAuthStore.getState
  >["user"] extends infer U
    ? U extends { role: infer R }
      ? R | undefined
      : undefined
    : undefined;
  readonly onConfirmCod: (row: PaymentLedgerItemDto) => void;
}

function createPaymentColumns({
  userRole,
  onConfirmCod,
}: CreatePaymentColumnsOptions) {
  return [
    columnHelper.accessor((row) => row.orderCode ?? row.subscriptionCode, {
      id: "document",
      header: "Chứng từ / Đơn hàng",
      cell: (info) => {
        const row = info.row.original;
        const primaryCode = row.orderCode ?? row.subscriptionCode ?? "—";
        return (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900 tabular-nums">
                {primaryCode}
              </span>
              {row.transactionType === PaymentTransactionType.REFUND ? (
                <Badge
                  variant="outline"
                  className="border-sky-200 bg-sky-50 text-sky-800"
                >
                  {TRANSACTION_TYPE_LABELS[row.transactionType]}
                </Badge>
              ) : null}
            </div>
            {row.referenceCode ? (
              <span className="text-xs text-gray-500 tabular-nums">
                Tham chiếu: {row.referenceCode}
              </span>
            ) : null}
          </div>
        );
      },
    }),
    columnHelper.accessor("paymentMethod", {
      header: "Phương thức",
      cell: (info) => (
        <span className="text-sm text-gray-800">
          {PAYMENT_METHOD_LABELS[info.getValue()]}
        </span>
      ),
    }),
    columnHelper.accessor("amountVnd", {
      header: () => <div className="text-right">Số tiền</div>,
      cell: (info) => {
        const row = info.row.original;
        const isRefund = row.transactionType === PaymentTransactionType.REFUND;
        return (
          <div
            className={cn(
              "text-right font-semibold tabular-nums",
              isRefund ? "text-status-spoiled" : "text-gray-900",
            )}
          >
            {formatSignedLedgerAmount(info.getValue(), row.transactionType)}
          </div>
        );
      },
    }),
    columnHelper.accessor("status", {
      header: "Trạng thái & Đối soát",
      cell: (info) => {
        const row = info.row.original;
        const status = info.getValue();
        const recon = getReconciliationBadge(row);
        return (
          <div className="flex flex-col items-start gap-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                variant="outline"
                className={PAYMENT_STATUS_BADGE_CLASSES[status]}
              >
                {PAYMENT_STATUS_LABELS[status]}
              </Badge>
              <Badge variant="outline" className={recon.className}>
                {recon.label}
              </Badge>
            </div>
            {recon.detail ? (
              <span className="text-xs text-gray-500 tabular-nums">
                {recon.detail}
              </span>
            ) : null}
          </div>
        );
      },
    }),
    columnHelper.accessor((row) => row.paidAt ?? row.createdAt, {
      id: "timestamp",
      header: "Thời gian",
      cell: (info) => {
        const row = info.row.original;
        return (
          <div className="flex flex-col gap-0.5 text-xs text-gray-600 tabular-nums">
            <span>{formatViDateTime(info.getValue())}</span>
            <span className="text-gray-400">
              {row.paidAt ? "Thanh toán lúc" : "Tạo lúc"}
            </span>
          </div>
        );
      },
    }),
    columnHelper.display({
      id: "actions",
      header: () => <div className="text-right">Thao tác</div>,
      cell: (info) => {
        const row = info.row.original;
        if (!canConfirmCodPayment(row, userRole)) {
          return <div className="text-right text-xs text-gray-400">—</div>;
        }
        return (
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onConfirmCod(row)}
            >
              Xác nhận COD
            </Button>
          </div>
        );
      },
    }),
  ];
}

/**
 * Staff payment ledger view with method/status/type/search filters,
 * PayOS webhook reconciliation badges, and manual COD confirmation.
 */
export function PaymentsLedgerTab() {
  const userRole = useAuthStore((state) => state.user?.role);

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [methodFilter, setMethodFilter] = useState<PaymentMethodFilter>("all");
  const [statusFilter, setStatusFilter] = useState<PaymentStatusFilter>("all");
  const [typeFilter, setTypeFilter] =
    useState<PaymentTransactionTypeFilter>("all");
  const [codTarget, setCodTarget] = useState<PaymentLedgerItemDto | null>(null);
  const [confirmedBanner, setConfirmedBanner] = useState<string | null>(null);

  const queryParams = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      paymentMethod: methodFilter,
      status: statusFilter,
      transactionType: typeFilter,
      search: searchInput,
    }),
    [page, methodFilter, statusFilter, typeFilter, searchInput],
  );

  const ledgerQuery = useQuery({
    queryKey: FINANCE_QUERY_KEYS.paymentsList(queryParams),
    queryFn: () => fetchPaymentLedger(queryParams),
    placeholderData: keepPreviousData,
  });

  const items = ledgerQuery.data?.items ?? [];
  const total = ledgerQuery.data?.total ?? 0;
  const totalPages = ledgerQuery.data?.totalPages ?? 1;

  const activeMethodLabel =
    PAYMENT_METHOD_FILTER_OPTIONS.find((opt) => opt.value === methodFilter)
      ?.label ?? "Tất cả phương thức";
  const activeStatusLabel =
    PAYMENT_STATUS_FILTER_OPTIONS.find((opt) => opt.value === statusFilter)
      ?.label ?? "Tất cả trạng thái";
  const activeTypeLabel =
    TRANSACTION_TYPE_FILTER_OPTIONS.find((opt) => opt.value === typeFilter)
      ?.label ?? "Tất cả giao dịch";

  const columns = useMemo(
    () =>
      createPaymentColumns({
        userRole,
        onConfirmCod: (row) => setCodTarget(row),
      }),
    [userRole],
  );

  // oxlint-disable-next-line react/incompatible-library
  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="flex flex-col gap-4">
      {confirmedBanner ? (
        <Alert variant="success">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          <AlertTitle>Đã xác nhận thu tiền COD</AlertTitle>
          <AlertDescription>{confirmedBanner}</AlertDescription>
        </Alert>
      ) : null}

      {ledgerQuery.error ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertTitle>Không thể tải sổ cái thanh toán</AlertTitle>
          <AlertDescription>
            {ledgerQuery.error instanceof Error
              ? ledgerQuery.error.message
              : "Đã có lỗi xảy ra khi tải dữ liệu."}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
              setPage(1);
            }}
            placeholder="Tìm mã đơn, mã PayOS, mã tham chiếu..."
            aria-label="Tìm kiếm giao dịch thanh toán"
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full sm:w-56">
            <Select
              value={methodFilter}
              onValueChange={(value) => {
                if (value) {
                  setMethodFilter(value);
                  setPage(1);
                }
              }}
            >
              <SelectTrigger aria-label="Lọc phương thức thanh toán">
                <SelectValue>{activeMethodLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHOD_FILTER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-full sm:w-44">
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                if (value) {
                  setStatusFilter(value);
                  setPage(1);
                }
              }}
            >
              <SelectTrigger aria-label="Lọc trạng thái thanh toán">
                <SelectValue>{activeStatusLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_STATUS_FILTER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-full sm:w-40">
            <Select
              value={typeFilter}
              onValueChange={(value) => {
                if (value) {
                  setTypeFilter(value);
                  setPage(1);
                }
              }}
            >
              <SelectTrigger aria-label="Lọc loại giao dịch">
                <SelectValue>{activeTypeLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TRANSACTION_TYPE_FILTER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void ledgerQuery.refetch()}
            disabled={ledgerQuery.isFetching}
            className="gap-1.5"
          >
            <RefreshCw
              className={cn(
                "size-4",
                ledgerQuery.isFetching ? "animate-spin" : "",
              )}
              aria-hidden="true"
            />
            <span>Làm mới</span>
          </Button>
        </div>
      </div>

      <Card className="border-border-subtle bg-surface-card shadow-sm">
        <CardContent className="p-0">
          {ledgerQuery.isLoading ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500">
              Không có giao dịch thanh toán nào phù hợp với bộ lọc hiện tại.
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-gray-50 text-xs font-bold text-gray-600 uppercase">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id}>
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
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
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
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-xs text-gray-600 tabular-nums">
        <span>
          Hiển thị {items.length} / {total} giao dịch · Trang {page} /{" "}
          {Math.max(1, totalPages)}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            aria-label="Trang trước"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            <span>Trước</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            aria-label="Trang sau"
          >
            <span>Sau</span>
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <CodConfirmDialog
        payment={codTarget}
        open={codTarget !== null}
        onOpenChange={(open) => {
          if (!open) setCodTarget(null);
        }}
        onConfirmed={(updated) => {
          const code =
            updated.orderCode ?? updated.subscriptionCode ?? updated.id;
          setConfirmedBanner(
            `Giao dịch ${code} (${formatVnd(updated.amountVnd)}) đã được cập nhật trạng thái đã thanh toán.`,
          );
        }}
      />
    </div>
  );
}

import { WasteLogStatus } from "@greenroots/shared";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@greenroots/ui";
import { useQuery } from "@tanstack/react-query";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { AlertCircle, CheckCircle2, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import {
  useAuthStore,
  type BackofficeUser,
} from "@/features/auth/stores/auth.store";
import { fetchWasteLogs, WASTE_QUERY_KEYS } from "../waste-api";
import {
  evaluateWasteReviewGuard,
  formatWasteTimestamp,
  WASTE_STATUS_META,
  WASTE_STATUS_TABS,
  type WasteLogDto,
  type WasteStatusFilter,
} from "../waste-utils";
import { WasteDetailDialog } from "./waste-detail-dialog";

const PAGE_LIMIT = 20;
const EMPTY_WASTE_LOGS: WasteLogDto[] = [];

const columnHelper = createColumnHelper<WasteLogDto>();

function createWasteColumns(options: {
  readonly currentUser: BackofficeUser | null;
  readonly onOpenDetail: (log: WasteLogDto) => void;
}) {
  return [
    columnHelper.accessor((row) => row.batch.productName, {
      id: "batch",
      header: "Lô hàng / Sản phẩm",
      cell: (info) => {
        const log = info.row.original;
        return (
          <div>
            <div className="font-medium text-gray-900">
              {log.batch.productName}
            </div>
            <div className="text-xs text-gray-500 tabular-nums">
              {log.batch.batchCode} · Tồn: {log.batch.availableQuantity}{" "}
              {log.batch.unit}
            </div>
          </div>
        );
      },
    }),
    columnHelper.accessor("discardedQuantity", {
      header: () => <div className="text-right">Số lượng hủy</div>,
      cell: (info) => {
        const log = info.row.original;
        return (
          <div className="text-right font-semibold text-destructive tabular-nums">
            -{log.discardedQuantity} {log.batch.unit}
          </div>
        );
      },
    }),
    columnHelper.accessor((row) => row.reporter.fullName, {
      id: "reporter",
      header: "Người đề xuất",
      cell: (info) => {
        const log = info.row.original;
        const guard = evaluateWasteReviewGuard(log, options.currentUser);
        return (
          <div>
            <div className="text-gray-900">{log.reporter.fullName}</div>
            {guard.isSelfProposal ? (
              <div className="text-xs text-amber-700">
                Phiếu của bạn (4 mắt)
              </div>
            ) : null}
          </div>
        );
      },
    }),
    columnHelper.accessor("reason", {
      header: "Lý do",
      cell: (info) => (
        <p className="line-clamp-2 max-w-xs text-gray-700">{info.getValue()}</p>
      ),
    }),
    columnHelper.accessor("createdAt", {
      header: "Thời gian",
      cell: (info) => (
        <span className="text-gray-600 tabular-nums">
          {formatWasteTimestamp(info.getValue())}
        </span>
      ),
    }),
    columnHelper.accessor("status", {
      header: "Trạng thái",
      cell: (info) => {
        const statusMeta = WASTE_STATUS_META[info.getValue()];
        return (
          <Badge variant="outline" className={statusMeta.badgeClassName}>
            {statusMeta.label}
          </Badge>
        );
      },
    }),
    columnHelper.display({
      id: "actions",
      header: () => <div className="text-right">Thao tác</div>,
      cell: (info) => {
        const log = info.row.original;
        const guard = evaluateWasteReviewGuard(log, options.currentUser);
        const isPending = log.status === WasteLogStatus.PENDING_APPROVAL;
        return (
          <div className="text-right">
            <Button
              type="button"
              variant={isPending && guard.canReview ? "default" : "outline"}
              size="sm"
              onClick={() => options.onOpenDetail(log)}
              className={
                isPending && guard.canReview
                  ? "bg-brand-forest text-white hover:bg-brand-dark"
                  : undefined
              }
            >
              {isPending && guard.canReview ? "Thẩm định" : "Chi tiết"}
            </Button>
          </div>
        );
      },
    }),
  ];
}

/**
 * Interactive 2-step waste review and approval workspace for Backoffice Admins.
 */
export function WasteApprovalView() {
  const currentUser = useAuthStore((state) => state.user);

  const [statusFilter, setStatusFilter] = useState<WasteStatusFilter>(
    WasteLogStatus.PENDING_APPROVAL,
  );
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<WasteLogDto | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const queryParams = {
    status: statusFilter === "all" ? undefined : statusFilter,
    search: searchText.trim() || undefined,
    page,
    limit: PAGE_LIMIT,
    sort: "createdAt:desc" as const,
  };

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: WASTE_QUERY_KEYS.list(queryParams),
    queryFn: () => fetchWasteLogs(queryParams),
  });

  const items = data?.items ?? EMPTY_WASTE_LOGS;
  const totalPages = data?.totalPages ?? 1;

  const columns = useMemo(
    () =>
      createWasteColumns({
        currentUser,
        onOpenDetail: (log) => {
          setSelectedLog(log);
          setDetailOpen(true);
        },
      }),
    [currentUser],
  );

  // oxlint-disable-next-line react/incompatible-library
  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  function handleTabChange(value: unknown) {
    if (
      value === "all" ||
      value === WasteLogStatus.PENDING_APPROVAL ||
      value === WasteLogStatus.APPROVED ||
      value === WasteLogStatus.REJECTED
    ) {
      setStatusFilter(value);
      setPage(1);
    }
  }

  return (
    <div className="space-y-4">
      {statusMessage ? (
        <Alert variant="success">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          <AlertDescription>{statusMessage}</AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden="true" />
          <AlertDescription>
            {error instanceof Error
              ? error.message
              : "Không thể tải danh sách phiếu xuất hủy."}
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs value={statusFilter} onValueChange={handleTabChange}>
        <TabsList
          variant="line"
          className="h-auto w-full justify-start gap-4 border-b border-border-subtle p-0 pb-1"
        >
          {WASTE_STATUS_TABS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="flex-none px-2 py-2 text-sm font-semibold data-active:text-gray-900"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400"
            aria-hidden="true"
          />
          <Input
            value={searchText}
            onChange={(event) => {
              setSearchText(event.target.value);
              setPage(1);
            }}
            placeholder="Tìm theo mã lô, sản phẩm, người đề xuất..."
            aria-label="Tìm kiếm phiếu xuất hủy"
            className="pl-9"
          />
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          <RefreshCw
            className={`mr-1.5 size-4 ${isFetching ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          Làm mới
        </Button>
      </div>

      <Card className="border-border-subtle bg-surface-card">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : items.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-gray-500">
              Không có phiếu xuất hủy nào phù hợp với bộ lọc hiện tại.
            </div>
          ) : (
            <Table>
              <TableHeader>
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

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span className="tabular-nums">
            Trang {data?.page ?? page} / {totalPages} (Tổng {data?.total ?? 0}{" "}
            phiếu)
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1 || isFetching}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              Trước
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages || isFetching}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            >
              Sau
            </Button>
          </div>
        </div>
      ) : null}

      <WasteDetailDialog
        key={selectedLog?.id ?? "none"}
        wasteLog={selectedLog}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onReviewed={setStatusMessage}
      />
    </div>
  );
}

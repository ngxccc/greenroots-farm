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
import { AlertCircle, CheckCircle2, RefreshCw, Search } from "lucide-react";
import { useState } from "react";
import { useAuthStore } from "@/features/auth/stores/auth.store";
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

  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;

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

  function handleOpenDetail(log: WasteLogDto) {
    setSelectedLog(log);
    setDetailOpen(true);
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
                <TableRow>
                  <TableHead>Lô hàng / Sản phẩm</TableHead>
                  <TableHead className="text-right">Số lượng hủy</TableHead>
                  <TableHead>Người đề xuất</TableHead>
                  <TableHead>Lý do</TableHead>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((log) => {
                  const statusMeta = WASTE_STATUS_META[log.status];
                  const guard = evaluateWasteReviewGuard(log, currentUser);
                  const isPending =
                    log.status === WasteLogStatus.PENDING_APPROVAL;

                  return (
                    <TableRow key={log.id}>
                      <TableCell>
                        <div className="font-medium text-gray-900">
                          {log.batch.productName}
                        </div>
                        <div className="text-xs text-gray-500 tabular-nums">
                          {log.batch.batchCode} · Tồn:{" "}
                          {log.batch.availableQuantity} {log.batch.unit}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-destructive tabular-nums">
                        -{log.discardedQuantity} {log.batch.unit}
                      </TableCell>
                      <TableCell>
                        <div className="text-gray-900">
                          {log.reporter.fullName}
                        </div>
                        {guard.isSelfProposal ? (
                          <div className="text-xs text-amber-700">
                            Phiếu của bạn (4 mắt)
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <p className="line-clamp-2 text-gray-700">
                          {log.reason}
                        </p>
                      </TableCell>
                      <TableCell className="text-gray-600 tabular-nums">
                        {formatWasteTimestamp(log.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={statusMeta.badgeClassName}
                        >
                          {statusMeta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant={
                            isPending && guard.canReview ? "default" : "outline"
                          }
                          size="sm"
                          onClick={() => handleOpenDetail(log)}
                          className={
                            isPending && guard.canReview
                              ? "bg-brand-forest text-white hover:bg-brand-dark"
                              : undefined
                          }
                        >
                          {isPending && guard.canReview
                            ? "Thẩm định"
                            : "Chi tiết"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
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

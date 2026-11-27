import { BatchStatus, WasteLogStatus } from "@greenroots/shared";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from "@greenroots/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { AlertCircle, Plus, QrCode, Search, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import {
  createBatch,
  createWasteLog,
  fetchActiveProducts,
  fetchBatches,
  fetchIntakeSeasons,
  fetchWasteLogs,
} from "../batches.api";
import {
  BATCH_STATUS_META,
  computeHsdStatus,
  formatVietnamDate,
  type BatchDto,
  type CreateBatchDto,
  type CreateWasteLogDto,
} from "../batches.utils";
import { BatchIntakeDialog } from "./batch-intake-dialog";
import { QrLabelPrintDialog } from "./qr-label-print-dialog";
import { WasteProposalTab } from "./waste-proposal-tab";

type BatchFilterStatus = "all" | BatchStatus;

const columnHelper = createColumnHelper<BatchDto>();

function buildBatchColumns({
  onPrintQr,
  onProposeWaste,
}: {
  readonly onPrintQr: (batch: BatchDto) => void;
  readonly onProposeWaste: (batchId: string) => void;
}) {
  return [
    columnHelper.accessor("batchCode", {
      header: "Mã lô",
      cell: (info) => (
        <span className="font-semibold text-gray-900 tabular-nums">
          {info.getValue()}
        </span>
      ),
    }),
    columnHelper.display({
      id: "productSeason",
      header: "Sản phẩm / Mùa vụ",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium text-gray-900">
            {row.original.product.name}
          </span>
          <span className="text-xs text-gray-500">
            {row.original.season.seasonName}
          </span>
        </div>
      ),
    }),
    columnHelper.display({
      id: "stock",
      header: "Tồn kho",
      cell: ({ row }) => (
        <span className="tabular-nums">
          <span className="font-semibold text-gray-900">
            {row.original.availableQuantity}
          </span>{" "}
          <span className="text-gray-500">
            / {row.original.initialQuantity} {row.original.product.unit}
          </span>
        </span>
      ),
    }),
    columnHelper.display({
      id: "dates",
      header: "Thu hoạch / HSD",
      cell: ({ row }) => (
        <div className="flex flex-col text-xs text-gray-600 tabular-nums">
          <span>TH: {formatVietnamDate(row.original.harvestDate)}</span>
          <span className="font-medium text-gray-900">
            HSD: {formatVietnamDate(row.original.expirationDate)}
          </span>
        </div>
      ),
    }),
    columnHelper.display({
      id: "hsdAlert",
      header: "Cảnh báo HSD",
      cell: ({ row }) => {
        const hsd = computeHsdStatus(
          row.original.expirationDate,
          row.original.status,
        );
        return (
          <div className="flex flex-col gap-1">
            <Badge
              variant="outline"
              className={cn("w-fit font-medium", hsd.badgeClassName)}
            >
              {hsd.label}
            </Badge>
            <span className="text-xs text-gray-500 tabular-nums">
              {hsd.countdownText}
            </span>
          </div>
        );
      },
    }),
    columnHelper.accessor("status", {
      header: "Trạng thái",
      cell: (info) => {
        const statusMeta = BATCH_STATUS_META[info.getValue()];
        return (
          <Badge
            variant="outline"
            className={cn("font-medium", statusMeta.badgeClassName)}
          >
            {statusMeta.label}
          </Badge>
        );
      },
    }),
    columnHelper.display({
      id: "actions",
      header: () => <div className="text-right">Thao tác</div>,
      cell: ({ row }) => {
        const batch = row.original;
        return (
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onPrintQr(batch)}
            >
              <QrCode className="size-3.5" aria-hidden="true" />
              In tem QR
            </Button>
            {batch.status !== BatchStatus.SOLD_OUT &&
            batch.availableQuantity > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`Đề xuất hủy lô ${batch.batchCode}`}
                onClick={() => onProposeWaste(batch.id)}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                Hủy
              </Button>
            ) : null}
          </div>
        );
      },
    }),
  ];
}

const BATCH_FILTER_OPTIONS: readonly {
  readonly value: BatchFilterStatus;
  readonly label: string;
}[] = [
  { value: "all", label: "Tất cả trạng thái" },
  { value: BatchStatus.IN_STOCK, label: "Đang bán" },
  { value: BatchStatus.NEAR_EXPIRY, label: "Sắp hết hạn" },
  { value: BatchStatus.SOLD_OUT, label: "Hết hàng" },
  { value: BatchStatus.EXPIRED, label: "Hết hạn" },
];

/**
 * Main backoffice view for harvest batch intake, HSD alerts, thermal QR printing, and waste proposals.
 */
export function BatchesView() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"batches" | "waste">("batches");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<BatchFilterStatus>("all");
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [qrBatch, setQrBatch] = useState<BatchDto | null>(null);
  const [preselectedWasteBatchId, setPreselectedWasteBatchId] = useState("");

  const batchesQuery = useQuery({
    queryKey: ["batches"],
    queryFn: () => fetchBatches(),
  });

  const wasteLogsQuery = useQuery({
    queryKey: ["waste-logs"],
    queryFn: () => fetchWasteLogs(),
  });

  const productsQuery = useQuery({
    queryKey: ["products-for-intake"],
    queryFn: () => fetchActiveProducts(),
  });

  const seasonsQuery = useQuery({
    queryKey: ["seasons-for-intake"],
    queryFn: () => fetchIntakeSeasons(),
  });

  const createBatchMutation = useMutation({
    mutationFn: ({
      payload,
      idempotencyKey,
    }: {
      payload: CreateBatchDto;
      idempotencyKey: string;
    }) => createBatch(payload, idempotencyKey),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["batches"] });
    },
  });

  const createWasteLogMutation = useMutation({
    mutationFn: ({
      payload,
      idempotencyKey,
    }: {
      payload: CreateWasteLogDto;
      idempotencyKey: string;
    }) => createWasteLog(payload, idempotencyKey),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["waste-logs"] });
    },
  });

  const batches = useMemo(() => batchesQuery.data ?? [], [batchesQuery.data]);
  const wasteLogs = useMemo(
    () => wasteLogsQuery.data ?? [],
    [wasteLogsQuery.data],
  );

  const kpis = useMemo(() => {
    const inStock = batches.filter(
      (b) => b.status === BatchStatus.IN_STOCK,
    ).length;
    const nearExpiry = batches.filter(
      (b) => b.status === BatchStatus.NEAR_EXPIRY,
    ).length;
    const expiredOrSoldOut = batches.filter(
      (b) =>
        b.status === BatchStatus.EXPIRED || b.status === BatchStatus.SOLD_OUT,
    ).length;
    const pendingWaste = wasteLogs.filter(
      (w) => w.status === WasteLogStatus.PENDING_APPROVAL,
    ).length;

    return { inStock, nearExpiry, expiredOrSoldOut, pendingWaste };
  }, [batches, wasteLogs]);

  const filteredBatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return batches.filter((batch) => {
      if (statusFilter !== "all" && batch.status !== statusFilter) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        batch.batchCode.toLowerCase().includes(q) ||
        batch.product.name.toLowerCase().includes(q) ||
        batch.season.seasonName.toLowerCase().includes(q)
      );
    });
  }, [batches, searchQuery, statusFilter]);

  const handleProposeWaste = useCallback((batchId: string): void => {
    setPreselectedWasteBatchId(batchId);
    setActiveTab("waste");
  }, []);

  const columns = useMemo(
    () =>
      buildBatchColumns({
        onPrintQr: setQrBatch,
        onProposeWaste: handleProposeWaste,
      }),
    [handleProposeWaste],
  );

  // oxlint-disable-next-line react/incompatible-library
  const table = useReactTable({
    data: filteredBatches,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        eyebrow="Canh tác"
        title="Lô thu hoạch"
        description="Ghi nhận lô thu hoạch mới, theo dõi cảnh báo hạn sử dụng (HSD), in tem nhiệt QR và lập đề xuất xuất hủy."
        actions={
          <Button type="button" onClick={() => setIntakeOpen(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Tạo lô thu hoạch
          </Button>
        }
      />

      <section
        aria-label="Tổng quan lô thu hoạch"
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
      >
        <Card className="border-border-subtle bg-surface-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-gray-500">
              Lô đang bán
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-brand-forest tabular-nums">
              {kpis.inStock} lô
            </p>
            <p className="text-xs text-gray-500">Đủ điều kiện xuất FEFO</p>
          </CardContent>
        </Card>

        <Card className="border-border-subtle bg-surface-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-gray-500">
              Sắp hết hạn
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-700 tabular-nums">
              {kpis.nearExpiry} lô
            </p>
            <p className="text-xs text-gray-500">Ưu tiên xuất trước</p>
          </CardContent>
        </Card>

        <Card className="border-border-subtle bg-surface-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-gray-500">
              Hết hạn / Hết hàng
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-status-spoiled tabular-nums">
              {kpis.expiredOrSoldOut} lô
            </p>
            <p className="text-xs text-gray-500">Cần khóa bán & xử lý</p>
          </CardContent>
        </Card>

        <Card className="border-border-subtle bg-surface-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-gray-500">
              Đề xuất hủy chờ duyệt
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-gray-900 tabular-nums">
              {kpis.pendingWaste} phiếu
            </p>
            <p className="text-xs text-gray-500">Chờ Admin phê duyệt</p>
          </CardContent>
        </Card>
      </section>

      <Tabs
        value={activeTab}
        onValueChange={(value) =>
          setActiveTab(value === "waste" ? "waste" : "batches")
        }
      >
        <TabsList variant="line">
          <TabsTrigger value="batches">Lô hàng & Cảnh báo HSD</TabsTrigger>
          <TabsTrigger value="waste">Đề xuất xuất hủy</TabsTrigger>
        </TabsList>

        <TabsContent value="batches" className="mt-4">
          <Card className="border-border-subtle bg-surface-card">
            <CardHeader>
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <CardTitle>Danh sách lô hàng & Cảnh báo HSD</CardTitle>
                  <p className="mt-1 text-sm text-gray-500">
                    Nhấn In tem QR để xem trước tem nhiệt trỏ tới trang truy
                    xuất nguồn gốc.
                  </p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-gray-400"
                      aria-hidden="true"
                    />
                    <Input
                      type="search"
                      placeholder="Tìm mã lô, sản phẩm..."
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      className="w-full pl-8 sm:w-56"
                      aria-label="Tìm kiếm lô thu hoạch"
                    />
                  </div>

                  <Select
                    value={statusFilter}
                    onValueChange={(value) => setStatusFilter(value ?? "all")}
                  >
                    <SelectTrigger className="w-full sm:w-44">
                      <SelectValue placeholder="Lọc trạng thái" />
                    </SelectTrigger>
                    <SelectContent>
                      {BATCH_FILTER_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {batchesQuery.error ? (
                <Alert variant="destructive">
                  <AlertCircle className="size-4" aria-hidden="true" />
                  <AlertDescription>
                    {batchesQuery.error instanceof Error
                      ? batchesQuery.error.message
                      : "Không thể tải danh sách lô thu hoạch."}
                  </AlertDescription>
                </Alert>
              ) : batchesQuery.isLoading ? (
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : filteredBatches.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-500">
                  Không tìm thấy lô thu hoạch nào phù hợp.
                </p>
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
        </TabsContent>

        <TabsContent value="waste" className="mt-4">
          <WasteProposalTab
            batches={batches}
            wasteLogs={wasteLogs}
            selectedBatchId={preselectedWasteBatchId}
            onSelectedBatchIdChange={setPreselectedWasteBatchId}
            isPending={createWasteLogMutation.isPending}
            onSubmit={async (payload, idempotencyKey) => {
              await createWasteLogMutation.mutateAsync({
                payload,
                idempotencyKey,
              });
            }}
          />
        </TabsContent>
      </Tabs>

      <BatchIntakeDialog
        open={intakeOpen}
        onOpenChange={setIntakeOpen}
        products={productsQuery.data ?? []}
        seasons={seasonsQuery.data ?? []}
        isPending={createBatchMutation.isPending}
        onSubmit={async (payload, idempotencyKey) => {
          await createBatchMutation.mutateAsync({ payload, idempotencyKey });
        }}
      />

      <QrLabelPrintDialog
        batch={qrBatch}
        open={Boolean(qrBatch)}
        onOpenChange={(open) => {
          if (!open) {
            setQrBatch(null);
          }
        }}
      />
    </div>
  );
}

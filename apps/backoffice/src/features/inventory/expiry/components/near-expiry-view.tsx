import { BUSINESS_RULES } from "@greenroots/shared";
import {
  Alert,
  AlertDescription,
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
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@greenroots/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  EXPIRY_QUERY_KEYS,
  fetchNearExpiryBatches,
  toggleBatchFlashSale,
} from "../expiry-api";
import {
  evaluateFlashSaleEligibility,
  FLASH_SALE_FILTER_LABELS,
  type FlashSaleFilter,
  formatExpiryTimestamp,
  formatShelfLifeCountdown,
  formatVnd,
  type NearExpiryBatchDto,
} from "../expiry-utils";
import { FlashSaleConfigDialog } from "./flash-sale-config-dialog";

const PAGE_LIMIT = 20;
const EMPTY_BATCHES: NearExpiryBatchDto[] = [];

const columnHelper = createColumnHelper<NearExpiryBatchDto>();

function createNearExpiryColumns(options: {
  readonly togglingBatchId: string | null;
  readonly onQuickToggle: (batch: NearExpiryBatchDto, checked: boolean) => void;
  readonly onOpenConfig: (batch: NearExpiryBatchDto) => void;
}) {
  return [
    columnHelper.accessor((row) => row.product.name, {
      id: "product",
      header: "Sản phẩm / Lô hàng",
      cell: (info) => {
        const batch = info.row.original;
        return (
          <div>
            <div className="font-medium text-gray-900">
              {batch.product.name}
            </div>
            <div className="text-xs text-gray-500 tabular-nums">
              {batch.batchCode} · {batch.season.seasonName}
            </div>
          </div>
        );
      },
    }),
    columnHelper.accessor("availableQuantity", {
      header: () => <div className="text-right">Tồn khả dụng</div>,
      cell: (info) => {
        const batch = info.row.original;
        return (
          <div className="text-right font-medium text-gray-900 tabular-nums">
            {batch.availableQuantity} {batch.product.unit}
          </div>
        );
      },
    }),
    columnHelper.accessor("hoursRemaining", {
      header: "Hạn sử dụng",
      cell: (info) => {
        const batch = info.row.original;
        const countdown = formatShelfLifeCountdown(batch.hoursRemaining);
        return (
          <div className="space-y-1">
            <Badge variant="outline" className={countdown.badgeClassName}>
              {countdown.label}
            </Badge>
            <div className="text-xs text-gray-500 tabular-nums">
              {formatExpiryTimestamp(batch.expirationDate)}
            </div>
          </div>
        );
      },
    }),
    columnHelper.accessor("rescuePriceVnd", {
      header: () => <div className="text-right">Giá bán / Giải cứu</div>,
      cell: (info) => {
        const batch = info.row.original;
        return (
          <div className="text-right tabular-nums">
            <div className="font-semibold text-gray-900">
              {batch.isFlashSale
                ? formatVnd(batch.rescuePriceVnd)
                : formatVnd(batch.salePriceVnd ?? batch.basePriceVnd)}
            </div>
            <div className="text-xs text-gray-500">
              Gốc: {formatVnd(batch.basePriceVnd)}
              {batch.isFlashSale
                ? ` (-${batch.effectiveDiscountPercent}%)`
                : ""}
            </div>
          </div>
        );
      },
    }),
    columnHelper.accessor("isFlashSale", {
      header: "Flash Sale",
      cell: (info) => {
        const batch = info.row.original;
        const eligibility = evaluateFlashSaleEligibility(batch);
        const isPendingThisRow = options.togglingBatchId === batch.id;
        const disableToggle =
          isPendingThisRow || (!batch.isFlashSale && !eligibility.eligible);

        return (
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <Switch
                checked={batch.isFlashSale}
                onCheckedChange={(checked) =>
                  options.onQuickToggle(batch, checked)
                }
                disabled={disableToggle}
                aria-label={`Bật hoặc tắt Flash Sale cho lô ${batch.batchCode}`}
              />
              {batch.isFlashSale ? (
                <Badge
                  variant="outline"
                  className="border-emerald-200 bg-emerald-50 text-brand-dark tabular-nums"
                >
                  Đang bật -{batch.effectiveDiscountPercent}%
                </Badge>
              ) : (
                <span className="text-xs text-gray-500">Tắt</span>
              )}
            </div>
            {!batch.isFlashSale &&
            !eligibility.eligible &&
            eligibility.reason ? (
              <p className="max-w-48 text-xs text-destructive">
                {eligibility.reason}
              </p>
            ) : null}
          </div>
        );
      },
    }),
    columnHelper.display({
      id: "actions",
      header: () => <div className="text-right">Thao tác</div>,
      cell: (info) => {
        const batch = info.row.original;
        return (
          <div className="text-right">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => options.onOpenConfig(batch)}
            >
              <SlidersHorizontal
                className="mr-1.5 size-3.5"
                aria-hidden="true"
              />
              Cấu hình
            </Button>
          </div>
        );
      },
    }),
  ];
}

/**
 * Near-expiry batch monitoring and Rescue Flash Sale configuration workspace.
 */
export function NearExpiryView() {
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [searchText, setSearchText] = useState("");
  const [flashSaleFilter, setFlashSaleFilter] =
    useState<FlashSaleFilter>("all");
  const [selectedBatch, setSelectedBatch] = useState<NearExpiryBatchDto | null>(
    null,
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const queryParams = {
    page,
    limit: PAGE_LIMIT,
  };

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: EXPIRY_QUERY_KEYS.list(queryParams),
    queryFn: () => fetchNearExpiryBatches(queryParams),
  });

  const quickToggleMutation = useMutation({
    mutationFn: (input: {
      batch: NearExpiryBatchDto;
      enabled: boolean;
      discountPercent?: number;
    }) =>
      toggleBatchFlashSale(input.batch.id, {
        enabled: input.enabled,
        discountPercent: input.discountPercent,
      }),
    onSuccess: async (_updated, variables) => {
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: EXPIRY_QUERY_KEYS.all });
      if (variables.enabled) {
        setStatusMessage(
          `Đã bật Flash Sale (-${variables.discountPercent}%) cho lô ${variables.batch.batchCode}.`,
        );
      } else {
        setStatusMessage(
          `Đã tắt Flash Sale cho lô ${variables.batch.batchCode}.`,
        );
      }
    },
    onError: (err) => {
      setActionError(
        err instanceof Error
          ? err.message
          : "Không thể cập nhật trạng thái Flash Sale.",
      );
    },
  });

  const rawItems = data?.items ?? EMPTY_BATCHES;
  const totalPages = data?.totalPages ?? 1;

  const filteredItems = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();
    return rawItems.filter((item) => {
      if (flashSaleFilter === "active" && !item.isFlashSale) {
        return false;
      }
      if (flashSaleFilter === "inactive" && item.isFlashSale) {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }
      return (
        item.batchCode.toLowerCase().includes(normalizedSearch) ||
        item.product.name.toLowerCase().includes(normalizedSearch) ||
        item.season.seasonName.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [rawItems, searchText, flashSaleFilter]);

  const togglingBatchId = quickToggleMutation.isPending
    ? quickToggleMutation.variables.batch.id
    : null;

  const columns = useMemo(
    () =>
      createNearExpiryColumns({
        togglingBatchId,
        onQuickToggle: (batch, checked) => {
          setStatusMessage(null);
          setActionError(null);
          if (checked) {
            const eligibility = evaluateFlashSaleEligibility(batch);
            if (!eligibility.eligible) {
              setActionError(
                eligibility.reason ??
                  "Lô hàng không đủ điều kiện bật Flash Sale.",
              );
              return;
            }
            quickToggleMutation.mutate({
              batch,
              enabled: true,
              discountPercent:
                batch.flashSaleDiscountPercent ??
                BUSINESS_RULES.FLASH_SALE_DISCOUNT_PERCENT,
            });
          } else {
            quickToggleMutation.mutate({
              batch,
              enabled: false,
            });
          }
        },
        onOpenConfig: (batch) => {
          setActionError(null);
          setSelectedBatch(batch);
          setDialogOpen(true);
        },
      }),
    [togglingBatchId, quickToggleMutation],
  );

  // oxlint-disable-next-line react/incompatible-library
  const table = useReactTable({
    data: filteredItems,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="space-y-4">
      {statusMessage ? (
        <Alert variant="success">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          <AlertDescription>{statusMessage}</AlertDescription>
        </Alert>
      ) : null}

      {actionError ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden="true" />
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden="true" />
          <AlertDescription>
            {error instanceof Error
              ? error.message
              : "Không thể tải danh sách lô hàng cận hạn."}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-sm">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400"
              aria-hidden="true"
            />
            <Input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Tìm theo mã lô, sản phẩm, mùa vụ..."
              aria-label="Tìm kiếm lô hàng cận hạn"
              className="pl-9"
            />
          </div>

          <Select
            value={flashSaleFilter}
            onValueChange={(value) => {
              if (
                value === "all" ||
                value === "active" ||
                value === "inactive"
              ) {
                setFlashSaleFilter(value);
              }
            }}
          >
            <SelectTrigger
              className="w-full sm:w-52"
              aria-label="Lọc trạng thái Flash Sale"
            >
              <SelectValue>
                {FLASH_SALE_FILTER_LABELS[flashSaleFilter]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {FLASH_SALE_FILTER_LABELS.all}
              </SelectItem>
              <SelectItem value="active">
                {FLASH_SALE_FILTER_LABELS.active}
              </SelectItem>
              <SelectItem value="inactive">
                {FLASH_SALE_FILTER_LABELS.inactive}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 tabular-nums">
            Ngưỡng cảnh báo: &lt; {BUSINESS_RULES.FLASH_SALE_HOURS_THRESHOLD}{" "}
            giờ
          </span>
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
      </div>

      <Card className="border-border-subtle bg-surface-card">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-gray-500 tabular-nums">
              Không có lô hàng cận hạn nào dưới{" "}
              {BUSINESS_RULES.FLASH_SALE_HOURS_THRESHOLD} giờ phù hợp với bộ lọc
              hiện tại.
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
            lô)
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

      <FlashSaleConfigDialog
        key={selectedBatch?.id ?? "none"}
        batch={selectedBatch}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={(message) => {
          setActionError(null);
          setStatusMessage(message);
        }}
      />
    </div>
  );
}

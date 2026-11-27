import {
  ORDER_STATUS_LABELS,
  OrderStatus,
  PAYMENT_METHOD_LABELS,
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
  Tabs,
  TabsList,
  TabsTrigger,
} from "@greenroots/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Eye,
  Printer,
  Search,
  XCircle,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { useAuthStore } from "@/features/auth/stores/auth.store";
import { OrderCancelDialog } from "@/features/orders/components/order-cancel-dialog";
import { OrderFefoDialog } from "@/features/orders/components/order-fefo-dialog";
import { PickListModal } from "@/features/orders/components/pick-list-modal";
import {
  fetchStaffOrders,
  ORDERS_QUERY_KEYS,
  updateOrderStatus,
} from "@/features/orders/orders.api";
import {
  canCancelOrder,
  canConfirmOrderFefo,
  canManageOrderFulfillment,
  formatViDate,
  formatViDateTime,
  formatVnd,
  getActiveAllocations,
  getDeliveryScheduleCue,
  getNextForwardActionLabel,
  getNextForwardStatus,
  getOrderCodDisplay,
  isPickListEligible,
  ORDER_STATUS_BADGE_CLASSES,
  ORDER_STATUS_TABS,
  type OrderStatusFilter,
  type StaffOrderDto,
  SUBSCRIPTION_FILTER_OPTIONS,
  type SubscriptionFilter,
} from "@/features/orders/orders.utils";

export const Route = createFileRoute("/orders/")({
  component: OrdersFefoPage,
});

const columnHelper = createColumnHelper<StaffOrderDto>();

function createOrderColumns(options: {
  readonly canManage: boolean;
  readonly isTransitioningId: string | null;
  readonly onInspectFefo: (order: StaffOrderDto) => void;
  readonly onAdvanceStatus: (order: StaffOrderDto, next: OrderStatus) => void;
  readonly onOpenCancel: (order: StaffOrderDto) => void;
  readonly onOpenPickList: (order: StaffOrderDto) => void;
}) {
  return [
    columnHelper.accessor("orderCode", {
      header: "Mã đơn & Tuyến",
      cell: (info) => {
        const row = info.row.original;
        const cue = getDeliveryScheduleCue(row.createdAt, row.shippingAddress);
        return (
          <div className="flex flex-col gap-0.5">
            <span className="font-bold text-gray-900 tabular-nums">
              {info.getValue()}
            </span>
            <span className="text-xs text-gray-500 tabular-nums">
              {formatViDateTime(row.createdAt)}
            </span>
            <span className="text-xs text-gray-600">
              {cue.dayLabel} · {cue.routeCue}
            </span>
          </div>
        );
      },
    }),
    columnHelper.accessor("receiverName", {
      header: "Khách hàng",
      cell: (info) => {
        const row = info.row.original;
        return (
          <div className="flex max-w-56 flex-col gap-0.5">
            <span className="font-medium text-gray-900">{info.getValue()}</span>
            <span className="text-xs text-gray-600 tabular-nums">
              {row.receiverPhone}
            </span>
            <span
              className="truncate text-xs text-gray-500"
              title={row.shippingAddress}
            >
              {row.shippingAddress}
            </span>
          </div>
        );
      },
    }),
    columnHelper.display({
      id: "fefoAllocations",
      header: "Lô FEFO",
      cell: (info) => {
        const allocations = getActiveAllocations(info.row.original);
        if (allocations.length === 0) {
          return (
            <span className="text-xs text-gray-500">Chưa giữ lô FEFO</span>
          );
        }
        const first = allocations[0];
        if (!first) {
          return null;
        }
        return (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-semibold text-brand-forest tabular-nums">
              {first.batchCode} (HSD {formatViDate(first.expirationDate)})
            </span>
            <span className="text-xs text-gray-600 tabular-nums">
              SL giữ: {first.allocatedQuantity} {first.unit}
              {allocations.length > 1 ? ` (+${allocations.length - 1} lô)` : ""}
            </span>
          </div>
        );
      },
    }),
    columnHelper.accessor("paymentMethod", {
      header: "Thanh toán / COD",
      cell: (info) => {
        const row = info.row.original;
        const cod = getOrderCodDisplay(row);
        return (
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-gray-800">
                {PAYMENT_METHOD_LABELS[info.getValue()]}
              </span>
              {cod.badgeLabel ? (
                <Badge variant="secondary" className="text-[11px]">
                  {cod.badgeLabel}
                </Badge>
              ) : null}
            </div>
            <span className="text-xs text-gray-600 tabular-nums">
              {cod.paymentStatusLabel} · Tổng {formatVnd(row.totalAmountVnd)}
              {!cod.isSubscription && cod.codVnd > 0
                ? ` · Thu COD: ${formatVnd(cod.codVnd)}`
                : ""}
            </span>
          </div>
        );
      },
    }),
    columnHelper.accessor("orderStatus", {
      header: "Trạng thái",
      cell: (info) => {
        const status = info.getValue();
        return (
          <Badge
            variant="outline"
            className={ORDER_STATUS_BADGE_CLASSES[status]}
          >
            {ORDER_STATUS_LABELS[status]}
          </Badge>
        );
      },
    }),
    columnHelper.display({
      id: "actions",
      header: "Thao tác",
      cell: (info) => {
        const row = info.row.original;
        const confirmable = canConfirmOrderFefo(row.orderStatus);
        const nextStatus = getNextForwardStatus(row.orderStatus);
        const nextLabel = getNextForwardActionLabel(row.orderStatus);
        const cancellable = canCancelOrder(row.orderStatus);
        const pickListReady = isPickListEligible(row.orderStatus);
        const isBusy = options.isTransitioningId === row.id;

        return (
          <div className="flex flex-wrap items-center gap-1.5">
            {options.canManage && confirmable ? (
              <Button
                type="button"
                size="xs"
                onClick={() => options.onInspectFefo(row)}
                className="gap-1"
              >
                <Zap className="size-3.5" aria-hidden="true" />
                <span>Xác nhận FEFO</span>
              </Button>
            ) : (
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => options.onInspectFefo(row)}
                className="gap-1"
              >
                <Eye className="size-3.5" aria-hidden="true" />
                <span>Chi tiết</span>
              </Button>
            )}

            {options.canManage && nextStatus && nextLabel ? (
              <Button
                type="button"
                size="xs"
                variant="secondary"
                disabled={isBusy}
                onClick={() => options.onAdvanceStatus(row, nextStatus)}
                className="gap-1"
              >
                <ArrowRight className="size-3.5" aria-hidden="true" />
                <span>{nextLabel}</span>
              </Button>
            ) : null}

            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={!pickListReady}
              onClick={() => options.onOpenPickList(row)}
              title={
                pickListReady
                  ? "Mở phiếu soạn hàng FEFO"
                  : "Chỉ in phiếu khi đơn ở trạng thái Đã xác nhận, Đang đóng gói hoặc Đang giao"
              }
              className="gap-1"
            >
              <Printer className="size-3.5" aria-hidden="true" />
              <span>In phiếu</span>
            </Button>

            {options.canManage && cancellable ? (
              <Button
                type="button"
                size="xs"
                variant="destructive"
                disabled={isBusy}
                onClick={() => options.onOpenCancel(row)}
                className="gap-1"
              >
                <XCircle className="size-3.5" aria-hidden="true" />
                <span>Hủy</span>
              </Button>
            ) : null}
          </div>
        );
      },
    }),
  ];
}

function OrdersFefoPage() {
  const queryClient = useQueryClient();
  const userRole = useAuthStore((state) => state.user?.role);
  const canManage = canManageOrderFulfillment(userRole);

  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>("all");
  const [subscriptionFilter, setSubscriptionFilter] =
    useState<SubscriptionFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);

  const [selectedFefoOrder, setSelectedFefoOrder] =
    useState<StaffOrderDto | null>(null);
  const [cancelOrderTarget, setCancelOrderTarget] =
    useState<StaffOrderDto | null>(null);
  const [pickListOrderTarget, setPickListOrderTarget] =
    useState<StaffOrderDto | null>(null);

  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [transitioningId, setTransitioningId] = useState<string | null>(null);

  const queryParams = useMemo(
    () => ({
      status: statusFilter,
      subscription: subscriptionFilter,
      search: searchInput,
      page,
      limit: 20,
      sort: "createdAt:desc" as const,
    }),
    [statusFilter, subscriptionFilter, searchInput, page],
  );

  const ordersQuery = useQuery({
    queryKey: ORDERS_QUERY_KEYS.list(queryParams),
    queryFn: () => fetchStaffOrders(queryParams),
  });

  const advanceMutation = useMutation({
    mutationFn: ({
      orderId,
      nextStatus,
    }: {
      readonly orderId: string;
      readonly nextStatus: OrderStatus;
    }) => updateOrderStatus(orderId, nextStatus),
    onMutate: ({ orderId }) => {
      setTransitioningId(orderId);
      setActionError(null);
      setActionNotice(null);
    },
    onSuccess: (updated) => {
      setActionNotice(
        `Đã chuyển đơn ${updated.orderCode} sang trạng thái ${ORDER_STATUS_LABELS[updated.orderStatus]}.`,
      );
      void queryClient.invalidateQueries({ queryKey: ORDERS_QUERY_KEYS.all });
    },
    onError: (err) => {
      setActionError(
        err instanceof Error
          ? err.message
          : "Không thể cập nhật trạng thái đơn hàng.",
      );
    },
    onSettled: () => {
      setTransitioningId(null);
    },
  });

  const columns = useMemo(
    () =>
      createOrderColumns({
        canManage,
        isTransitioningId: transitioningId,
        onInspectFefo: (order) => {
          setActionError(null);
          setSelectedFefoOrder(order);
        },
        onAdvanceStatus: (order, nextStatus) =>
          advanceMutation.mutate({ orderId: order.id, nextStatus }),
        onOpenCancel: (order) => {
          setActionError(null);
          setCancelOrderTarget(order);
        },
        onOpenPickList: (order) => {
          setPickListOrderTarget(order);
        },
      }),
    [canManage, transitioningId, advanceMutation],
  );

  const orders = ordersQuery.data?.items ?? [];

  // oxlint-disable-next-line react/incompatible-library
  const table = useReactTable({
    data: orders,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const activeSubscriptionLabel =
    SUBSCRIPTION_FILTER_OPTIONS.find((opt) => opt.value === subscriptionFilter)
      ?.label ?? "Tất cả loại đơn";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Bán hàng & Kho"
        title="Đơn hàng"
        description="Điều phối đơn hàng, xác nhận giữ lô FEFO và in phiếu soạn hàng."
        actions={<Badge variant="secondary">FEFO</Badge>}
      />

      {!canManage ? (
        <Alert>
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertDescription>
            Tài khoản hiện tại chỉ có quyền xem. Chỉ nhân viên Kinh doanh hoặc
            Quản trị viên mới được phép xác nhận FEFO hoặc chuyển trạng thái
            đơn.
          </AlertDescription>
        </Alert>
      ) : null}

      {actionNotice ? (
        <Alert variant="success">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          <AlertDescription>{actionNotice}</AlertDescription>
        </Alert>
      ) : null}

      {actionError ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertTitle>Thao tác đơn hàng thất bại</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      ) : null}

      {ordersQuery.isError ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertTitle>Không thể tải danh sách đơn hàng</AlertTitle>
          <AlertDescription>
            {ordersQuery.error instanceof Error
              ? ordersQuery.error.message
              : "Vui lòng kiểm tra kết nối và thử lại."}
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs
        value={statusFilter}
        onValueChange={(value) => {
          setStatusFilter(value as OrderStatusFilter);
          setPage(1);
        }}
      >
        <TabsList variant="line" className="flex-wrap">
          {ORDER_STATUS_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
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
            type="search"
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
              setPage(1);
            }}
            placeholder="Tìm mã đơn, tên hoặc SĐT khách..."
            aria-label="Tìm kiếm đơn hàng"
            className="pl-9"
          />
        </div>

        <div className="w-full sm:w-52">
          <Select
            value={subscriptionFilter}
            onValueChange={(value) => {
              if (value) {
                setSubscriptionFilter(value);
                setPage(1);
              }
            }}
          >
            <SelectTrigger aria-label="Lọc loại đơn hàng">
              <SelectValue>{activeSubscriptionLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SUBSCRIPTION_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="border-border-subtle bg-surface-card shadow-sm">
        <CardContent className="p-0">
          {ordersQuery.isLoading ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : orders.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500">
              Không có đơn hàng nào phù hợp với bộ lọc hiện tại.
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-gray-50 text-xs font-bold text-gray-600 uppercase">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow
                    key={headerGroup.id}
                    className="hover:bg-transparent"
                  >
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
                      <TableCell key={cell.id} className="px-4 py-3 align-top">
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

      {ordersQuery.data && ordersQuery.data.totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span className="tabular-nums">
            Trang {ordersQuery.data.page} / {ordersQuery.data.totalPages} (
            {ordersQuery.data.total} đơn)
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              Trước
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page >= ordersQuery.data.totalPages}
              onClick={() => setPage((prev) => prev + 1)}
            >
              Sau
            </Button>
          </div>
        </div>
      ) : null}

      <OrderFefoDialog
        key={selectedFefoOrder?.id ?? "fefo-none"}
        order={selectedFefoOrder}
        open={selectedFefoOrder !== null}
        canManage={canManage}
        onOpenChange={(open) => {
          if (!open) setSelectedFefoOrder(null);
        }}
        onConfirmed={(updated) => {
          setActionNotice(
            `Đã xác nhận đơn ${updated.orderCode} và giữ lô FEFO thành công.`,
          );
        }}
      />

      <OrderCancelDialog
        key={cancelOrderTarget?.id ?? "cancel-none"}
        order={cancelOrderTarget}
        open={cancelOrderTarget !== null}
        onOpenChange={(open) => {
          if (!open) setCancelOrderTarget(null);
        }}
        onCancelled={(updated) => {
          setActionNotice(`Đã hủy đơn ${updated.orderCode} và giải phóng lô.`);
        }}
      />

      <PickListModal
        order={pickListOrderTarget}
        open={pickListOrderTarget !== null}
        onOpenChange={(open) => {
          if (!open) setPickListOrderTarget(null);
        }}
      />
    </div>
  );
}

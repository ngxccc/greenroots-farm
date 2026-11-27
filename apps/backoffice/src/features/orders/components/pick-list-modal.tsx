import { ORDER_STATUS_LABELS } from "@greenroots/shared";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@greenroots/ui";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Printer } from "lucide-react";
import {
  fetchOrderPickList,
  ORDERS_QUERY_KEYS,
  OrdersApiError,
} from "../orders.api";
import {
  formatViDate,
  formatViDateTime,
  formatVnd,
  getDeliveryScheduleCue,
  getOrderCodDisplay,
  groupPickListByBatch,
  isPickListEligible,
  type StaffOrderDto,
} from "../orders.utils";

export interface PickListModalProps {
  readonly order: StaffOrderDto | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * Printable FEFO batch-grouped warehouse pick list modal (`GET /api/v1/orders/:id/pick-list`).
 */
export function PickListModal({
  order,
  open,
  onOpenChange,
}: PickListModalProps) {
  const eligible = order ? isPickListEligible(order.orderStatus) : false;

  const pickListQuery = useQuery({
    queryKey: order
      ? ORDERS_QUERY_KEYS.pickList(order.id)
      : ["orders", "pick-list", "none"],
    queryFn: () => {
      if (!order) {
        throw new Error("Order is required");
      }
      return fetchOrderPickList(order.id);
    },
    enabled: open && Boolean(order) && eligible,
    retry: false,
  });

  if (!order) {
    return null;
  }

  const codDisplay = getOrderCodDisplay(order);
  const scheduleCue = getDeliveryScheduleCue(
    order.createdAt,
    order.shippingAddress,
  );
  const groupedBatches = pickListQuery.data
    ? groupPickListByBatch(pickListQuery.data)
    : [];

  const isConflictError =
    pickListQuery.error instanceof OrdersApiError &&
    pickListQuery.error.status === 409;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <style>{`
          @media print {
            body * {
              visibility: hidden !important;
            }
            #printable-pick-list,
            #printable-pick-list * {
              visibility: visible !important;
            }
            #printable-pick-list {
              position: fixed !important;
              inset: 0 !important;
              width: 100% !important;
              background: #ffffff !important;
              padding: 24px !important;
              margin: 0 !important;
            }
          }
        `}</style>

        <div id="printable-pick-list" className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center justify-between gap-2">
              <span>Phiếu soạn hàng FEFO — {order.orderCode}</span>
              {codDisplay.badgeLabel ? (
                <Badge variant="secondary">{codDisplay.badgeLabel}</Badge>
              ) : null}
            </DialogTitle>
            <DialogDescription>
              {order.receiverName} ·{" "}
              <span className="tabular-nums">{order.receiverPhone}</span> ·{" "}
              {scheduleCue.dayLabel} ({scheduleCue.routeCue})
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center justify-between gap-2 border-y border-border-subtle py-2 text-xs text-gray-600">
            <span>Địa chỉ: {order.shippingAddress}</span>
            <span className="font-semibold text-gray-900 tabular-nums">
              Thu hộ COD: {formatVnd(codDisplay.codVnd)}
            </span>
          </div>

          {!eligible ? (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" aria-hidden="true" />
              <AlertTitle>Chưa đủ điều kiện in phiếu soạn hàng</AlertTitle>
              <AlertDescription>
                Phiếu soạn hàng chỉ khả dụng khi đơn hàng ở trạng thái Đã xác
                nhận, Đang đóng gói hoặc Đang giao (hiện tại:{" "}
                {ORDER_STATUS_LABELS[order.orderStatus]}).
              </AlertDescription>
            </Alert>
          ) : pickListQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : pickListQuery.isError ? (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" aria-hidden="true" />
              <AlertTitle>
                {isConflictError
                  ? "Trạng thái đơn hàng không hợp lệ để lấy phiếu soạn"
                  : "Không thể tải phiếu soạn hàng"}
              </AlertTitle>
              <AlertDescription>
                {pickListQuery.error instanceof Error
                  ? pickListQuery.error.message
                  : "Vui lòng tải lại danh sách đơn hàng và thử lại."}
              </AlertDescription>
            </Alert>
          ) : groupedBatches.length === 0 ? (
            <Alert>
              <AlertDescription>
                Đơn hàng này chưa có lô FEFO nào được phân bổ.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3">
              {pickListQuery.data ? (
                <p className="text-xs text-gray-500 tabular-nums">
                  Xuất phiếu lúc:{" "}
                  {formatViDateTime(pickListQuery.data.generatedAt)} · Trạng
                  thái: {ORDER_STATUS_LABELS[pickListQuery.data.orderStatus]}
                </p>
              ) : null}

              <Table>
                <TableHeader className="bg-gray-50 text-xs font-bold text-gray-600 uppercase">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-3 py-2">Mã lô (FEFO)</TableHead>
                    <TableHead className="px-3 py-2">Hạn sử dụng</TableHead>
                    <TableHead className="px-3 py-2">Sản phẩm</TableHead>
                    <TableHead className="px-3 py-2 text-right">
                      Số lượng lấy
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedBatches.map((batch) =>
                    batch.items.map((item, idx) => (
                      <TableRow key={`${batch.batchCode}-${item.productId}`}>
                        <TableCell className="px-3 py-2 font-semibold text-brand-forest tabular-nums">
                          {idx === 0 ? batch.batchCode : ""}
                        </TableCell>
                        <TableCell className="px-3 py-2 text-xs text-gray-700 tabular-nums">
                          {idx === 0 ? (
                            <span className="flex items-center gap-1.5">
                              <span>{formatViDate(batch.expirationDate)}</span>
                              {batch.isExpired ? (
                                <Badge variant="destructive">Hết hạn</Badge>
                              ) : null}
                            </span>
                          ) : (
                            ""
                          )}
                        </TableCell>
                        <TableCell className="px-3 py-2 text-gray-900">
                          {item.productName}
                        </TableCell>
                        <TableCell className="px-3 py-2 text-right font-semibold tabular-nums">
                          {item.allocatedQuantity} {item.unit}
                        </TableCell>
                      </TableRow>
                    )),
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 print:hidden">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Đóng
          </Button>
          <Button
            type="button"
            disabled={!eligible || groupedBatches.length === 0}
            onClick={() => window.print()}
            className="gap-1.5"
          >
            <Printer className="size-4" aria-hidden="true" />
            <span>In phiếu soạn hàng</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { BUSINESS_RULES } from "@greenroots/shared";
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from "@greenroots/ui";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Printer } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { fetchBatchQrLabel } from "../batches.api";
import {
  canPrintBatchQrLabel,
  formatQrLabelMeta,
  type BatchDto,
} from "../batches.utils";

interface QrLabelPrintDialogProps {
  readonly batch: BatchDto | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * Thermal QR label print preview modal for a harvested inventory batch.
 */
export function QrLabelPrintDialog({
  batch,
  open,
  onOpenChange,
}: QrLabelPrintDialogProps) {
  const {
    data: qrLabel,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["batch-qr-label", batch?.id],
    queryFn: () => fetchBatchQrLabel(batch!.id),
    enabled: open && Boolean(batch?.id),
  });

  const printEligibility = batch
    ? canPrintBatchQrLabel(batch.status)
    : { allowed: false, warning: null };

  const formatted = qrLabel ? formatQrLabelMeta(qrLabel) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <style>{`
          @media print {
            body * {
              visibility: hidden !important;
            }
            #thermal-qr-label-print-area,
            #thermal-qr-label-print-area * {
              visibility: visible !important;
            }
            #thermal-qr-label-print-area {
              position: fixed;
              left: 0;
              top: 0;
              width: 80mm;
              padding: 4mm;
              border: 1px solid #111827;
              background: #ffffff;
            }
          }
        `}</style>

        <DialogHeader>
          <DialogTitle>Xem trước & In tem nhiệt QR</DialogTitle>
          <DialogDescription>
            Tem truy xuất nguồn gốc gắn lên bao bì sản phẩm khi xuất kho.
          </DialogDescription>
        </DialogHeader>

        {printEligibility.warning ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" aria-hidden="true" />
            <AlertDescription>{printEligibility.warning}</AlertDescription>
          </Alert>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" aria-hidden="true" />
            <AlertDescription>
              {error instanceof Error
                ? error.message
                : "Không thể tải dữ liệu tem QR."}
            </AlertDescription>
          </Alert>
        ) : null}

        {isLoading ? (
          <div className="flex flex-col gap-3 py-4">
            <Skeleton className="h-28 w-full rounded-md" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : formatted ? (
          <div className="flex flex-col gap-3">
            <div
              id="thermal-qr-label-print-area"
              className="rounded-md border border-border-subtle bg-surface-card p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-xs font-semibold tracking-wide text-brand-forest uppercase">
                    {BUSINESS_RULES.FARM_ORIGIN.BRAND_NAME}
                  </span>
                  <p className="text-base font-bold text-gray-900">
                    {formatted.productName}
                  </p>
                  <p className="text-xs font-semibold text-gray-800 tabular-nums">
                    Mã lô: {formatted.batchCode}
                  </p>
                  <p className="text-xs text-gray-600">
                    Đơn vị: {formatted.unit}
                  </p>
                  <div className="mt-1 flex flex-col gap-0.5 text-xs text-gray-700 tabular-nums">
                    <span>Thu hoạch: {formatted.harvestDateFormatted}</span>
                    <span className="font-semibold text-gray-900">
                      HSD: {formatted.expirationDateFormatted}
                    </span>
                  </div>
                </div>

                <div
                  className="shrink-0 rounded border border-border-subtle bg-white p-1.5"
                  aria-label="Mã QR truy xuất lô hàng"
                >
                  <QRCodeSVG
                    value={formatted.qrValue}
                    size={96}
                    level="M"
                    bgColor="#ffffff"
                    fgColor="#111827"
                  />
                </div>
              </div>
            </div>

            <p className="text-xs break-all text-gray-500">
              Liên kết truy xuất: {formatted.traceUrl}
            </p>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Đóng
          </Button>
          <Button
            type="button"
            disabled={!formatted || !printEligibility.allowed}
            onClick={() => window.print()}
          >
            <Printer className="size-4" aria-hidden="true" />
            In tem nhiệt QR
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { BUSINESS_RULES } from "@greenroots/shared";
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
  Input,
  Label,
  Switch,
} from "@greenroots/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { EXPIRY_QUERY_KEYS, toggleBatchFlashSale } from "../expiry-api";
import {
  computeRescuePriceVnd,
  evaluateFlashSaleEligibility,
  FLASH_SALE_DISCOUNT_MAX,
  FLASH_SALE_DISCOUNT_MIN,
  formatExpiryTimestamp,
  formatShelfLifeCountdown,
  formatVnd,
  type NearExpiryBatchDto,
  validateFlashSaleDiscount,
} from "../expiry-utils";

interface FlashSaleConfigDialogProps {
  readonly batch: NearExpiryBatchDto | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: (message: string) => void;
}

/**
 * Dialog for configuring Rescue Flash Sale status and integer discount percentage (1-90%)
 * on a near-expiry batch.
 */
export function FlashSaleConfigDialog({
  batch,
  open,
  onOpenChange,
  onSaved,
}: FlashSaleConfigDialogProps) {
  const queryClient = useQueryClient();

  const [enabled, setEnabled] = useState(batch?.isFlashSale ?? false);
  const [discountInput, setDiscountInput] = useState(
    String(
      batch?.flashSaleDiscountPercent ??
        BUSINESS_RULES.FLASH_SALE_DISCOUNT_PERCENT,
    ),
  );
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (input: {
      id: string;
      enabled: boolean;
      discountPercent?: number;
    }) =>
      toggleBatchFlashSale(input.id, {
        enabled: input.enabled,
        discountPercent: input.discountPercent,
      }),
    onSuccess: async (_updated, variables) => {
      await queryClient.invalidateQueries({ queryKey: EXPIRY_QUERY_KEYS.all });
      onOpenChange(false);
      if (variables.enabled) {
        onSaved(
          `Đã bật Flash Sale (-${variables.discountPercent}%) cho lô ${batch?.batchCode ?? ""}.`,
        );
      } else {
        onSaved(`Đã tắt Flash Sale cho lô ${batch?.batchCode ?? ""}.`);
      }
    },
    onError: (err) => {
      setFormError(
        err instanceof Error
          ? err.message
          : "Không thể cập nhật cấu hình Flash Sale.",
      );
    },
  });

  if (!batch) {
    return null;
  }

  const eligibility = evaluateFlashSaleEligibility(batch);
  const countdown = formatShelfLifeCountdown(batch.hoursRemaining);
  const discountValidation = validateFlashSaleDiscount(discountInput);
  const previewDiscount = discountValidation.valid
    ? discountValidation.value
    : BUSINESS_RULES.FLASH_SALE_DISCOUNT_PERCENT;
  const previewRescuePriceVnd = computeRescuePriceVnd(
    batch.basePriceVnd,
    previewDiscount,
  );
  const enableBlocked = !eligibility.eligible && !batch.isFlashSale;

  function handleSubmit() {
    if (!batch) {
      return;
    }

    if (enabled && !eligibility.eligible) {
      setFormError(
        eligibility.reason ?? "Lô hàng không đủ điều kiện bật Flash Sale.",
      );
      return;
    }

    if (enabled) {
      if (!discountValidation.valid) {
        setFormError(discountValidation.error);
        return;
      }
      setFormError(null);
      mutation.mutate({
        id: batch.id,
        enabled: true,
        discountPercent: discountValidation.value,
      });
      return;
    }

    setFormError(null);
    mutation.mutate({
      id: batch.id,
      enabled: false,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>Cấu hình Rescue Flash Sale</DialogTitle>
            <Badge variant="outline" className={countdown.badgeClassName}>
              {countdown.label}
            </Badge>
          </div>
          <DialogDescription>
            Lô{" "}
            <span className="font-semibold text-gray-900 tabular-nums">
              {batch.batchCode}
            </span>{" "}
            — {batch.product.name}
          </DialogDescription>
        </DialogHeader>

        <div className="divide-y divide-border-subtle text-sm">
          {formError ? (
            <div className="pb-4">
              <Alert variant="destructive">
                <AlertCircle className="size-4" aria-hidden="true" />
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            </div>
          ) : null}

          {!eligibility.eligible && eligibility.reason ? (
            <div className="py-3 first:pt-0">
              <Alert variant="destructive">
                <AlertTriangle className="size-4" aria-hidden="true" />
                <AlertTitle>Không đủ điều kiện bật Flash Sale</AlertTitle>
                <AlertDescription>{eligibility.reason}</AlertDescription>
              </Alert>
            </div>
          ) : null}

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 py-4 first:pt-0">
            <div>
              <dt className="text-xs font-medium text-gray-500">
                Tồn kho khả dụng
              </dt>
              <dd className="mt-0.5 font-medium text-gray-900 tabular-nums">
                {batch.availableQuantity} {batch.product.unit}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Hạn sử dụng</dt>
              <dd className="mt-0.5 font-medium text-gray-900 tabular-nums">
                {formatExpiryTimestamp(batch.expirationDate)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Giá gốc</dt>
              <dd className="mt-0.5 font-medium text-gray-900 tabular-nums">
                {formatVnd(batch.basePriceVnd)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">
                Giá giải cứu dự kiến
              </dt>
              <dd className="mt-0.5 font-semibold text-brand-forest tabular-nums">
                {enabled
                  ? `${formatVnd(previewRescuePriceVnd)} (-${previewDiscount}%)`
                  : formatVnd(batch.salePriceVnd ?? batch.basePriceVnd)}
              </dd>
            </div>
          </dl>

          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="flash-sale-switch" className="text-sm">
                  Kích hoạt Flash Sale trên Storefront
                </Label>
                <p className="text-xs text-gray-500">
                  Áp dụng giảm giá riêng cho lô hàng này mà không sửa giá gốc
                  sản phẩm.
                </p>
              </div>
              <Switch
                id="flash-sale-switch"
                checked={enabled}
                onCheckedChange={(checked) => {
                  setEnabled(checked);
                  setFormError(null);
                }}
                disabled={enableBlocked || mutation.isPending}
                aria-label="Kích hoạt Flash Sale"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="flash-sale-discount">
                Mức giảm giá (%, từ {FLASH_SALE_DISCOUNT_MIN} đến{" "}
                {FLASH_SALE_DISCOUNT_MAX})
              </Label>
              <Input
                id="flash-sale-discount"
                type="number"
                min={FLASH_SALE_DISCOUNT_MIN}
                max={FLASH_SALE_DISCOUNT_MAX}
                step={1}
                value={discountInput}
                onChange={(event) => {
                  setDiscountInput(event.target.value);
                  setFormError(null);
                }}
                disabled={!enabled || mutation.isPending}
                className="tabular-nums"
              />
              <p className="text-xs text-gray-500 tabular-nums">
                Mặc định đề xuất: {BUSINESS_RULES.FLASH_SALE_DISCOUNT_PERCENT}%.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Hủy
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={mutation.isPending || (enabled && !eligibility.eligible)}
            className="bg-brand-forest text-white hover:bg-brand-dark"
          >
            {mutation.isPending ? "Đang lưu..." : "Lưu cấu hình"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

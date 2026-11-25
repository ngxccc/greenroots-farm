"use client";

import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Skeleton,
} from "@greenroots/ui";
import { AlertCircle, Loader2, RefreshCw, Truck } from "lucide-react";
import { formatVnd } from "@/lib/format";

/**
 * Minimal shipping quote shape shared by `ShippingQuoteDto` and guest preview quotes.
 */
export interface DeliveryQuoteSummaryValue {
  readonly roadDistanceKm: number;
  readonly feeVnd: number | null;
  readonly isDeliverable: boolean;
  readonly isFreeShipping?: boolean;
  readonly maxRadiusKm: number;
}

interface DeliveryQuoteSummaryProps {
  readonly districtName?: string;
  readonly quote: DeliveryQuoteSummaryValue | null;
  readonly isLoading?: boolean;
  readonly errorMessage?: string | null;
  readonly onRetry?: () => void;
}

/**
 * Reusable delivery distance, shipping fee, and dynamic radius validation summary card
 * shared by `DeliveryQuotePreview`, `AddressDialog`, and `SF-05` checkout (`#141`).
 */
export function DeliveryQuoteSummary({
  districtName,
  quote,
  isLoading = false,
  errorMessage = null,
  onRetry,
}: DeliveryQuoteSummaryProps) {
  if (errorMessage) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="size-4" aria-hidden="true" />
        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
          <span>{errorMessage}</span>
          {onRetry ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="h-7 cursor-pointer gap-1.5 text-xs"
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              <span>Thử lại</span>
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  }

  if (isLoading || !quote) {
    return (
      <div
        className="space-y-2 rounded-xl border border-border-subtle bg-surface-warm p-3 text-xs"
        aria-busy="true"
        aria-label="Đang tính phí giao hàng"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-gray-500">
            <Loader2
              className="size-4 shrink-0 animate-spin text-brand-forest"
              aria-hidden="true"
            />
            <span>
              {districtName
                ? `Đang tính khoảng cách (${districtName})...`
                : "Đang tính phí giao hàng..."}
            </span>
          </span>
          <Skeleton className="h-4 w-16 rounded" />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-3.5 w-32 rounded" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      </div>
    );
  }

  const isFree =
    quote.isDeliverable &&
    ((quote.isFreeShipping ?? false) || quote.feeVnd === 0);

  return (
    <div className="space-y-1.5 rounded-xl border border-border-subtle bg-surface-warm p-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-gray-600">
          <Truck
            className="size-4 shrink-0 text-brand-forest"
            aria-hidden="true"
          />
          <span>
            {districtName
              ? `Khoảng cách ước tính (${districtName})`
              : "Khoảng cách giao hàng"}
          </span>
        </span>
        <span className="font-bold text-gray-900 tabular-nums">
          ~{quote.roadDistanceKm} km
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-gray-600">Phí giao hỏa tốc dự kiến</span>
        {quote.isDeliverable && quote.feeVnd !== null ? (
          isFree ? (
            <Badge className="border-0 bg-green-100 text-brand-dark tabular-nums">
              Miễn phí (0đ)
            </Badge>
          ) : (
            <Badge className="border-0 bg-green-100 text-brand-dark tabular-nums">
              {formatVnd(quote.feeVnd)}
            </Badge>
          )
        ) : (
          <Badge variant="destructive">
            Ngoài phạm vi giao tươi {quote.maxRadiusKm} km
          </Badge>
        )}
      </div>
    </div>
  );
}

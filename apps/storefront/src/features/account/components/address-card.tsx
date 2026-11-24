"use client";

import { HCMC_DISTRICTS, findHcmcDistrictByCode } from "@greenroots/shared";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@greenroots/ui";
import { CheckCircle2, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { FARM_METADATA } from "@/constants/farm-metadata.constant";
import { formatVnd } from "@/lib/format";
import { estimateDistrictPreviewQuote } from "@/lib/shipping";
import type { CustomerAddress } from "@/types/address.types";

interface AddressCardProps {
  readonly address: CustomerAddress;
  readonly isPending?: boolean;
  readonly onRequestSetDefault: (address: CustomerAddress) => void;
  readonly onRequestEdit: (address: CustomerAddress) => void;
  readonly onRequestDelete: (address: CustomerAddress) => void;
}

/**
 * Customer saved-address card with server-derived district quote summary and
 * Base UI `DropdownMenu` actions (`Set Default`, `Edit`, `Delete`).
 *
 * @param props Persisted `CustomerAddress` and row action callbacks.
 * @returns Accessible address card using semantic GreenRoots design tokens.
 */
export function AddressCard({
  address,
  isPending = false,
  onRequestSetDefault,
  onRequestEdit,
  onRequestDelete,
}: AddressCardProps) {
  const district =
    findHcmcDistrictByCode(address.districtCode) ?? HCMC_DISTRICTS[0];
  const quote = estimateDistrictPreviewQuote(district);

  return (
    <article className="flex items-start justify-between gap-3 py-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-gray-900">
            {address.receiverName}
          </span>
          <span className="text-xs text-gray-500 tabular-nums">
            {address.phoneNumber}
          </span>
          {address.isDefault ? (
            <Badge className="border-0 bg-green-50 px-2.5 py-0.5 text-[11px] font-semibold text-brand-dark">
              Mặc định
            </Badge>
          ) : null}
        </div>

        <p className="text-sm text-gray-800">
          {address.streetAddress}, {address.district}, {address.city}
        </p>

        <p
          className={
            quote.isDeliverable
              ? "text-xs text-gray-600 tabular-nums"
              : "text-xs font-medium text-status-spoiled tabular-nums"
          }
        >
          {quote.isDeliverable
            ? `Cách farm ~${quote.roadDistanceKm} km — Phí giao dự kiến ${formatVnd(quote.feeVnd)}`
            : `Cách farm ~${quote.roadDistanceKm} km — Ngoài phạm vi giao tươi ${FARM_METADATA.maxDeliveryRadiusKm} km`}
        </p>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={isPending}
              aria-label={`Tùy chọn địa chỉ ${address.receiverName}`}
              className="shrink-0 cursor-pointer text-gray-600 hover:bg-white/80 hover:text-gray-900"
            />
          }
        >
          <MoreVertical className="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          sideOffset={6}
          aria-label={`Hành động cho địa chỉ ${address.streetAddress}`}
          className="w-48 rounded-xl border border-border-subtle bg-surface-card p-1 text-gray-800 shadow-lg ring-0"
        >
          {!address.isDefault ? (
            <DropdownMenuItem
              disabled={isPending}
              onClick={() => onRequestSetDefault(address)}
              className="cursor-pointer rounded-lg px-2.5 py-2 text-xs font-semibold text-gray-700 focus:bg-accent focus:text-brand-forest"
            >
              <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
              <span>Đặt làm mặc định</span>
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuItem
            disabled={isPending}
            onClick={() => onRequestEdit(address)}
            className="cursor-pointer rounded-lg px-2.5 py-2 text-xs font-semibold text-gray-700 focus:bg-accent focus:text-brand-forest"
          >
            <Pencil className="size-4 shrink-0" aria-hidden="true" />
            <span>Sửa địa chỉ</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator className="my-1 bg-border-subtle" />

          <DropdownMenuItem
            variant="destructive"
            disabled={isPending}
            onClick={() => onRequestDelete(address)}
            className="cursor-pointer rounded-lg px-2.5 py-2 text-xs font-semibold"
          >
            <Trash2 className="size-4 shrink-0" aria-hidden="true" />
            <span>Xóa địa chỉ</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </article>
  );
}

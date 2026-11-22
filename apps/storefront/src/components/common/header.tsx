"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type ReactNode, type SubmitEvent } from "react";
import { HCMC_DISTRICTS } from "@greenroots/shared";
import { Button, Input, Label } from "@greenroots/ui";
import { MapPin, Search, ShoppingCart } from "lucide-react";
import { buildProductSearchHref } from "@/lib/navigation";
import { estimateDistrictPreviewQuote } from "@/lib/shipping";
import { useCartStore } from "@/stores/cart.store";
import { AddressDialog } from "./address-dialog";
import { BrandLogo } from "./brand-logo";
import { CartDrawer } from "./cart-drawer";
import { HeaderAuthControls } from "./header-auth-controls";

interface StorefrontHeaderSearchFormProps {
  readonly query: string;
  readonly onQueryChange?: (value: string) => void;
  readonly onSubmit?: (event: SubmitEvent<HTMLFormElement>) => void;
}

/**
 * Pure presentational header product search form decoupled from Next.js router hooks.
 *
 * @param props Controlled search query and form interaction handlers.
 * @returns Controlled product search form wired to the supplied handlers.
 */
export function StorefrontHeaderSearchForm({
  query,
  onQueryChange,
  onSubmit,
}: StorefrontHeaderSearchFormProps) {
  const searchInputId = useId();

  return (
    <form
      onSubmit={onSubmit}
      className="order-3 w-full md:order-2 md:max-w-xl md:flex-1"
    >
      <div className="flex items-center gap-2 rounded-full border border-border-subtle bg-white py-1 pr-1.5 pl-4 focus-within:ring-2 focus-within:ring-green-200">
        <Label htmlFor={searchInputId} className="sr-only">
          Tìm kiếm nông sản
        </Label>
        <Search className="size-4 shrink-0 text-gray-500" aria-hidden="true" />
        <Input
          id={searchInputId}
          type="search"
          value={query}
          onChange={(event) => onQueryChange?.(event.target.value)}
          placeholder="Tìm rau củ hữu cơ tươi ngon..."
          className="h-auto border-0 bg-transparent p-0 text-xs text-gray-900 shadow-none placeholder:text-gray-500 focus-visible:ring-0 sm:text-sm"
        />
        <Button
          type="submit"
          size="sm"
          className="h-auto shrink-0 rounded-full bg-green-50 px-4 py-1.5 text-xs font-semibold text-brand-dark shadow-none hover:bg-green-100"
        >
          Tìm
        </Button>
      </div>
    </form>
  );
}

interface StorefrontHeaderProps {
  readonly authSlot?: ReactNode;
}

export function StorefrontHeader({ authSlot }: StorefrontHeaderProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);

  const items = useCartStore((state) => state.items);
  const selectedDistrictCode = useCartStore(
    (state) => state.selectedDistrictCode,
  );

  const totalCount = items.reduce((sum, item) => sum + item.quantity, 0);

  const activeDistrict =
    HCMC_DISTRICTS.find((item) => item.code === selectedDistrictCode) ??
    HCMC_DISTRICTS[0];
  const deliveryQuote = estimateDistrictPreviewQuote(activeDistrict);

  function handleSearchSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(buildProductSearchHref(searchQuery));
  }

  return (
    <>
      <header className="sticky top-0 z-40 bg-brand-forest text-white shadow-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3 lg:px-6">
          <Link
            href="/"
            className="flex shrink-0 items-center rounded focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
          >
            <BrandLogo variant="on-dark" size="md" />
          </Link>

          <StorefrontHeaderSearchForm
            query={searchQuery}
            onQueryChange={setSearchQuery}
            onSubmit={handleSearchSubmit}
          />

          <div className="order-2 flex shrink-0 items-center gap-4 md:order-3">
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              aria-label={`Giỏ hàng (${totalCount} sản phẩm)`}
              className="relative inline-flex cursor-pointer items-center justify-center rounded px-1.5 py-1 text-white transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
            >
              <ShoppingCart className="size-6" aria-hidden="true" />
              <span
                role="status"
                className="absolute -top-1.5 -right-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[11px] font-semibold text-brand-dark tabular-nums"
              >
                {totalCount}
              </span>
            </button>

            {authSlot ?? <HeaderAuthControls initialUser={null} />}
          </div>
        </div>
      </header>

      <div className="border-b border-border-subtle bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-2.5 text-xs lg:px-6">
          <MapPin
            className="size-4 shrink-0 text-brand-forest"
            aria-hidden="true"
          />
          <span className="text-gray-500">Giao đến:</span>
          <span className="font-semibold text-gray-900 tabular-nums">
            {activeDistrict.name}, TP.HCM (~{deliveryQuote.roadDistanceKm} km)
          </span>
          <button
            type="button"
            onClick={() => setAddressOpen(true)}
            className="cursor-pointer font-semibold text-brand-forest hover:underline focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:outline-none"
          >
            Đổi địa chỉ
          </button>
        </div>
      </div>

      <CartDrawer open={cartOpen} onOpenChange={setCartOpen} />
      <AddressDialog open={addressOpen} onOpenChange={setAddressOpen} />
    </>
  );
}

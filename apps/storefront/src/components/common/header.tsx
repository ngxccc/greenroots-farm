"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode, type SubmitEvent } from "react";
import { HCMC_DISTRICTS } from "@greenroots/shared";
import { Button } from "@greenroots/ui";
import { MapPin, Search, ShoppingCart } from "lucide-react";
import { buildProductSearchHref } from "@/lib/navigation";
import { estimateDistrictPreviewQuote } from "@/lib/shipping";
import { useCartStore } from "@/stores/cart.store";
import { AddressDialog } from "./address-dialog";
import { BrandLogo } from "./brand-logo";
import { CartDrawer } from "./cart-drawer";
import { HeaderAuthControls } from "./header-auth-controls";

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

          <form
            onSubmit={handleSearchSubmit}
            className="order-3 w-full md:order-2 md:max-w-xl md:flex-1"
          >
            <label className="flex items-center gap-2 rounded-full border border-border-subtle bg-white py-1 pr-1.5 pl-4 focus-within:ring-2 focus-within:ring-green-200">
              <Search
                className="size-4 shrink-0 text-gray-500"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Tìm rau củ hữu cơ tươi ngon..."
                aria-label="Tìm kiếm nông sản"
                className="w-full border-none bg-transparent p-0 text-xs text-gray-900 placeholder:text-gray-500 focus:ring-0 focus:outline-none sm:text-sm"
              />
              <Button
                type="submit"
                size="sm"
                className="h-auto shrink-0 rounded-full bg-green-50 px-4 py-1.5 text-xs font-semibold text-brand-dark shadow-none hover:bg-green-100"
              >
                Tìm
              </Button>
            </label>
          </form>

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

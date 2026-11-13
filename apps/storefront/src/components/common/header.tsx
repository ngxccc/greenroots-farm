"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type SubmitEvent } from "react";
import { HCMC_DISTRICTS, estimateDeliveryQuote } from "@greenroots/shared";
import { Leaf, MapPin, Search, ShoppingCart, User } from "lucide-react";
import { useCartStore } from "@/stores/cart.store";
import { AddressDialog } from "./address-dialog";
import { CartDrawer } from "./cart-drawer";

export function StorefrontHeader() {
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
  const deliveryQuote = estimateDeliveryQuote(
    activeDistrict.latitude,
    activeDistrict.longitude,
  );

  function handleSearchSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = searchQuery.trim();
    router.push(
      trimmed ? `/products?q=${encodeURIComponent(trimmed)}` : "/products",
    );
  }

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 shadow-md">
        <div className="bg-brand-forest text-white">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-3 py-2 lg:h-16 lg:flex-nowrap lg:gap-5 lg:px-4 lg:py-0">
            <Link
              href="/"
              className="flex shrink-0 items-center gap-2 text-base font-extrabold lg:text-xl"
            >
              <Leaf className="size-5 lg:size-6" />
              <span>
                GreenRoots
                <span className="ml-1 text-xs font-normal text-green-200 lg:text-sm">
                  Farm
                </span>
              </span>
            </Link>

            <div className="order-2 flex shrink-0 items-center gap-2 text-xs font-semibold lg:order-3 lg:gap-3 lg:text-sm">
              <button
                type="button"
                onClick={() => setCartOpen(true)}
                className="flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-white px-3 text-xs font-bold text-brand-forest shadow transition hover:bg-green-50 lg:h-10 lg:gap-2"
              >
                <ShoppingCart className="size-4" />
                <span className="hidden md:inline">Giỏ hàng</span>
                <span className="px-0.5 text-xs font-extrabold text-brand-forest lg:text-sm">
                  {totalCount}
                </span>
              </button>

              <Link
                href="/checkout"
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 transition hover:bg-white/10 hover:text-green-100"
              >
                <User className="size-4 shrink-0" />
                <span className="hidden sm:inline">Tài khoản</span>
              </Link>
            </div>

            <div className="order-3 w-full lg:order-2 lg:w-auto lg:flex-1">
              <form
                onSubmit={handleSearchSubmit}
                className="flex h-10 w-full overflow-hidden rounded-full border border-transparent bg-white shadow-inner focus-within:border-green-300"
              >
                <div className="flex items-center pl-3.5 text-gray-400">
                  <Search className="size-4" />
                </div>
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="min-w-0 flex-1 px-2.5 text-xs text-gray-900 outline-none placeholder:text-gray-400 lg:text-sm"
                  placeholder="Tìm rau củ hữu cơ tươi ngon..."
                  aria-label="Tìm kiếm nông sản"
                />
                <button
                  type="submit"
                  className="flex cursor-pointer items-center gap-1 border-l border-gray-100 px-4 text-xs font-bold text-brand-forest hover:bg-green-50"
                >
                  Tìm
                </button>
              </form>
            </div>
          </div>
        </div>

        <div className="border-b border-border-subtle bg-white text-xs shadow-sm">
          <div className="mx-auto flex h-10 max-w-7xl items-center justify-between gap-2 px-3 lg:px-4">
            <div className="flex min-w-0 items-center gap-2 text-gray-700">
              <MapPin className="size-4 shrink-0 text-brand-forest" />
              <span className="hidden text-gray-500 sm:inline">Giao đến:</span>
              <span className="truncate font-bold text-gray-900">
                {activeDistrict.name}, TP.HCM (~{deliveryQuote.roadDistanceKm}{" "}
                km)
              </span>
              <button
                type="button"
                onClick={() => setAddressOpen(true)}
                className="ml-1 shrink-0 cursor-pointer text-xs font-bold text-brand-forest hover:underline"
              >
                Đổi địa chỉ
              </button>
            </div>
          </div>
        </div>
      </header>

      <CartDrawer open={cartOpen} onOpenChange={setCartOpen} />
      <AddressDialog open={addressOpen} onOpenChange={setAddressOpen} />
    </>
  );
}

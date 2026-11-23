"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type ReactNode, type SubmitEvent } from "react";
import { HCMC_DISTRICTS } from "@greenroots/shared";
import { Badge, Button, Input, Label } from "@greenroots/ui";
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
          className="h-auto border-0 bg-transparent p-0 text-xs text-gray-900 shadow-none placeholder:text-gray-500 focus-visible:ring-0 sm:text-sm dark:bg-transparent"
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
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-1.5 gap-y-2.5 px-3 py-3 sm:gap-4 sm:px-4 lg:px-6">
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

          <div className="order-2 flex min-w-0 shrink-0 items-center gap-2 sm:gap-4 md:order-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setCartOpen(true)}
              aria-label={`Giỏ hàng (${totalCount} sản phẩm)`}
              className="relative size-auto rounded px-0.5 py-1 text-white hover:bg-transparent hover:text-white hover:opacity-90 focus-visible:border-white focus-visible:ring-2 focus-visible:ring-white sm:px-1.5 dark:hover:bg-transparent"
            >
              <ShoppingCart className="size-6" aria-hidden="true" />
              <Badge
                role="status"
                className="absolute -top-1.5 -right-2 h-4 min-w-4 border-0 bg-white px-1 text-[11px] font-semibold text-brand-dark tabular-nums"
              >
                {totalCount}
              </Badge>
            </Button>

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
          <Button
            type="button"
            variant="link"
            size="xs"
            onClick={() => setAddressOpen(true)}
            className="h-auto p-0 text-xs font-semibold text-brand-forest focus-visible:ring-2 focus-visible:ring-brand-forest"
          >
            Đổi địa chỉ
          </Button>
        </div>
      </div>

      <CartDrawer open={cartOpen} onOpenChange={setCartOpen} />
      <AddressDialog open={addressOpen} onOpenChange={setAddressOpen} />
    </>
  );
}

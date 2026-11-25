"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Suspense,
  useId,
  useState,
  type ReactNode,
  type SubmitEvent,
} from "react";
import { HCMC_DISTRICTS, findHcmcDistrictByCode } from "@greenroots/shared";
import {
  Button,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Label,
} from "@greenroots/ui";
import { MapPin, Search } from "lucide-react";
import { invalidateStorefrontClientSession } from "@/lib/auth/client-logout";
import { buildProductSearchHref } from "@/lib/navigation";
import { useShippingQuote } from "@/lib/shipping/use-shipping-quote";
import { useAuthStore } from "@/stores/auth.store";
import { useCartStore } from "@/stores/cart.store";
import {
  findActiveDeliveryAddress,
  useDeliveryAddressStore,
} from "@/stores/delivery-address.store";
import { AddressDialog } from "./address-dialog";
import { BrandLogo } from "./brand-logo";
import { HeaderCartPopover } from "@/features/orders";
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
      <Label htmlFor={searchInputId} className="sr-only">
        Tìm kiếm nông sản
      </Label>
      <InputGroup className="h-auto rounded-full border-border-subtle bg-white py-1 pr-1.5 pl-3.5 shadow-none has-[[data-slot=input-group-control]:focus-visible]:border-green-300 has-[[data-slot=input-group-control]:focus-visible]:ring-2 has-[[data-slot=input-group-control]:focus-visible]:ring-green-200 dark:bg-white">
        <InputGroupAddon className="py-0 pl-0 text-gray-500">
          <Search className="size-4" aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          id={searchInputId}
          type="search"
          value={query}
          onChange={(event) => onQueryChange?.(event.target.value)}
          placeholder="Tìm rau củ hữu cơ tươi ngon..."
          className="h-8 py-1 text-xs text-gray-900 placeholder:text-gray-500 sm:text-sm"
        />
        <InputGroupAddon
          align="inline-end"
          className="py-0 pr-0 has-[>button]:mr-0"
        >
          <InputGroupButton
            type="submit"
            size="sm"
            className="h-auto shrink-0 rounded-full bg-green-50 px-4 py-1.5 text-xs font-semibold text-brand-dark hover:bg-green-100 dark:hover:bg-green-100"
          >
            Tìm
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}

/**
 * Determines whether the sticky delivery location sub-bar renders below `StorefrontHeader`.
 * Hidden on `/account/*`, `/about`, `/policies/*`, and `/checkout` (where `CheckoutView`
 * renders the full recipient address selector directly).
 *
 * @param pathname Current client route pathname.
 * @returns `true` for storefront shopping and cart routes, `false` inside `/account/*`, `/about/*`, `/policies/*`, or `/checkout*`.
 */
export function shouldShowDeliverySubBar(pathname: string): boolean {
  if (pathname === "/account" || pathname.startsWith("/account/")) {
    return false;
  }
  if (pathname === "/about" || pathname.startsWith("/about/")) {
    return false;
  }
  if (pathname === "/policies" || pathname.startsWith("/policies/")) {
    return false;
  }
  if (pathname === "/checkout" || pathname.startsWith("/checkout/")) {
    return false;
  }
  return true;
}

function DeliveryLocationSubBar() {
  const pathname = usePathname();
  const [addressOpen, setAddressOpen] = useState(false);

  const selectedDistrictCode = useCartStore(
    (state) => state.selectedDistrictCode,
  );
  const activeUser = useAuthStore((state) => state.user);
  const savedAddresses = useDeliveryAddressStore((state) => state.addresses);
  const selectedAddressId = useDeliveryAddressStore(
    (state) => state.selectedAddressId,
  );

  const activeSavedAddress = activeUser
    ? findActiveDeliveryAddress(savedAddresses, selectedAddressId)
    : null;
  const effectiveDistrictCode = activeSavedAddress
    ? activeSavedAddress.districtCode
    : selectedDistrictCode;
  const activeDistrict =
    findHcmcDistrictByCode(effectiveDistrictCode) ?? HCMC_DISTRICTS[0];

  const serverQuote = useShippingQuote({
    enabled: Boolean(activeUser) && shouldShowDeliverySubBar(pathname),
    addressId: activeSavedAddress?.id ?? null,
    districtCode: activeSavedAddress ? null : activeDistrict.code,
    onSessionInvalidated: invalidateStorefrontClientSession,
  });

  if (!shouldShowDeliverySubBar(pathname)) {
    return null;
  }

  const distanceSuffix =
    activeUser && serverQuote.quote
      ? ` (~${serverQuote.quote.roadDistanceKm} km)`
      : "";

  return (
    <>
      <div className="border-b border-border-subtle bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5 text-xs lg:px-6">
          <MapPin
            className="size-4 shrink-0 text-brand-forest"
            aria-hidden="true"
          />
          <span className="shrink-0 text-gray-500">Giao đến:</span>
          <span className="min-w-0 truncate font-semibold text-gray-900 tabular-nums">
            {activeSavedAddress
              ? `${activeSavedAddress.streetAddress}, ${activeSavedAddress.district}`
              : `${activeDistrict.name}, TP.HCM`}
            {distanceSuffix}
          </span>
          <Button
            type="button"
            variant="link"
            size="xs"
            onClick={() => setAddressOpen(true)}
            className="h-auto shrink-0 p-0 text-xs font-semibold text-brand-forest focus-visible:ring-2 focus-visible:ring-brand-forest"
          >
            Đổi địa chỉ
          </Button>
        </div>
      </div>
      <AddressDialog open={addressOpen} onOpenChange={setAddressOpen} />
    </>
  );
}

interface StorefrontHeaderProps {
  readonly authSlot?: ReactNode;
}

export function StorefrontHeader({ authSlot }: StorefrontHeaderProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

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
            <HeaderCartPopover />

            {authSlot ?? <HeaderAuthControls initialUser={null} />}
          </div>
        </div>
      </header>

      {/* Isolate usePathname() inside Suspense so static PPR prerendering succeeds under cacheComponents (UI-3). */}
      <Suspense fallback={null}>
        <DeliveryLocationSubBar />
      </Suspense>
    </>
  );
}

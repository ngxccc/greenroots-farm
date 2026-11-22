"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type SubmitEvent } from "react";
import { Button, Input, Label } from "@greenroots/ui";
import { Search } from "lucide-react";
import { buildProductSearchHref } from "@/lib/navigation";

interface NotFoundSearchFormViewProps {
  readonly query?: string;
  readonly onQueryChange?: (value: string) => void;
  readonly onSubmit?: (event: SubmitEvent<HTMLFormElement>) => void;
}

/**
 * Pure presentational recovery search bar decoupled from Next.js router hooks for testability.
 *
 * @param props Controlled input state and submit callback.
 * @returns Search form markup targeting `/products`.
 */
export function NotFoundSearchFormView({
  query = "",
  onQueryChange,
  onSubmit,
}: NotFoundSearchFormViewProps) {
  const searchInputId = useId();

  return (
    <form
      action="/products"
      method="get"
      onSubmit={onSubmit}
      className="w-full max-w-md"
    >
      <div className="flex items-center gap-2 rounded-full border border-border-subtle bg-surface-warm py-1.5 pr-1.5 pl-4 focus-within:ring-2 focus-within:ring-brand-forest">
        <Label htmlFor={searchInputId} className="sr-only">
          Tìm kiếm sản phẩm trên trang không tìm thấy
        </Label>
        <Search className="size-4 shrink-0 text-gray-500" aria-hidden="true" />
        <Input
          id={searchInputId}
          type="search"
          name="q"
          value={query}
          onChange={(event) => onQueryChange?.(event.target.value)}
          placeholder="Tìm xà lách, cà chua bi, gói rau..."
          className="h-auto border-0 bg-transparent p-0 text-[13px] text-gray-900 shadow-none placeholder:text-gray-500 focus-visible:ring-0"
        />
        <Button
          type="submit"
          size="sm"
          className="h-auto shrink-0 cursor-pointer rounded-full bg-brand-forest px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark"
        >
          Tìm ngay
        </Button>
      </div>
    </form>
  );
}

/**
 * Inline catalog recovery search bar displayed on the Storefront 404 screen.
 *
 * @returns Interactive search form routing to `/products` or `/products?q=...`.
 */
export function NotFoundSearchForm() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(buildProductSearchHref(query));
  }

  return (
    <NotFoundSearchFormView
      query={query}
      onQueryChange={setQuery}
      onSubmit={handleSubmit}
    />
  );
}

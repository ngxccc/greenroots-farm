"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type SubmitEvent } from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Label,
} from "@greenroots/ui";
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
      <Label htmlFor={searchInputId} className="sr-only">
        Tìm kiếm sản phẩm trên trang không tìm thấy
      </Label>
      <InputGroup className="h-auto rounded-full border-border-subtle bg-surface-warm py-1 pr-1.5 pl-3.5 shadow-none has-[[data-slot=input-group-control]:focus-visible]:border-brand-forest has-[[data-slot=input-group-control]:focus-visible]:ring-2 has-[[data-slot=input-group-control]:focus-visible]:ring-brand-forest dark:bg-surface-warm">
        <InputGroupAddon className="py-0 pl-0 text-gray-500">
          <Search className="size-4" aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          id={searchInputId}
          type="search"
          name="q"
          value={query}
          onChange={(event) => onQueryChange?.(event.target.value)}
          placeholder="Tìm xà lách, cà chua bi, gói rau..."
          className="h-8 py-1 text-[13px] text-gray-900 placeholder:text-gray-500"
        />
        <InputGroupAddon
          align="inline-end"
          className="py-0 pr-0 has-[>button]:mr-0"
        >
          <InputGroupButton
            type="submit"
            size="sm"
            className="h-auto shrink-0 cursor-pointer rounded-full bg-brand-forest px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark hover:text-white dark:hover:bg-brand-dark"
          >
            Tìm ngay
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
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

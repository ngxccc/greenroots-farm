"use client";

import { type KeyboardEvent, useState } from "react";
import { Alert, AlertDescription, Button, Input } from "@greenroots/ui";
import { AlertCircle, Loader2, MapPin, Search } from "lucide-react";
import { invalidateStorefrontClientSession } from "@/features/auth/utils/client-logout";
import { usePlaceAutocomplete } from "@/features/geocoding/hooks/use-place-autocomplete";
import type { PlaceSuggestion } from "@/features/geocoding/types/geocoding.types";
import { useAuthStore } from "@/stores/auth.store";

interface PlaceAutocompleteInputProps {
  readonly id: string;
  readonly selectedPlaceId: string;
  readonly selectedLabel?: string;
  readonly disabled?: boolean;
  readonly onSelectPlace: (suggestion: PlaceSuggestion) => void;
}

/**
 * Debounced street-level Ho Chi Minh City address autocomplete backed by Goong Place
 * via `GET /api/geocoding/autocomplete` for authenticated customers.
 */
export function PlaceAutocompleteInput({
  id,
  selectedPlaceId,
  selectedLabel = "",
  disabled = false,
  onSelectPlace,
}: PlaceAutocompleteInputProps) {
  const activeUser = useAuthStore((state) => state.user);
  const [prevSelectedLabel, setPrevSelectedLabel] = useState(selectedLabel);
  const [query, setQuery] = useState(selectedLabel);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  if (selectedLabel !== prevSelectedLabel) {
    setPrevSelectedLabel(selectedLabel);
    setQuery(selectedLabel);
    setIsOpen(false);
    setActiveIndex(-1);
  }

  const isAuthenticated = Boolean(activeUser);
  const { status, suggestions, errorMessage } = usePlaceAutocomplete({
    enabled: isAuthenticated && isOpen,
    query,
    debounceMs: 300,
    onSessionInvalidated: invalidateStorefrontClientSession,
  });

  const showDropdown =
    isOpen &&
    query.trim().length >= 3 &&
    (status === "loading" || status === "success" || status === "error");
  const isListboxOpen = showDropdown && status === "success";
  const listboxId = `${id}-listbox`;
  const activeOptionId =
    isListboxOpen && activeIndex >= 0 && suggestions[activeIndex]
      ? `${id}-option-${activeIndex}`
      : undefined;

  function handleSelect(suggestion: PlaceSuggestion) {
    setQuery(suggestion.description);
    setIsOpen(false);
    setActiveIndex(-1);
    onSelectPlace(suggestion);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!isListboxOpen || suggestions.length === 0) {
      if (event.key === "Escape") {
        setIsOpen(false);
        setActiveIndex(-1);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
      return;
    }

    if (event.key === "Enter" && activeIndex >= 0 && suggestions[activeIndex]) {
      event.preventDefault();
      handleSelect(suggestions[activeIndex]);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div className="relative space-y-1.5">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400"
          aria-hidden="true"
        />
        <Input
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isListboxOpen}
          aria-controls={isListboxOpen ? listboxId : undefined}
          aria-activedescendant={activeOptionId}
          value={query}
          disabled={disabled || !isAuthenticated}
          autoComplete="off"
          placeholder="Nhập tên đường, phường tại TP.HCM (tối thiểu 3 ký tự)..."
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => {
            if (query.trim().length >= 3) {
              setIsOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          className="h-10 bg-white pr-9 pl-9 text-sm"
        />
        {status === "loading" ? (
          <Loader2
            className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-brand-forest"
            aria-hidden="true"
          />
        ) : null}
      </div>

      {selectedPlaceId ? (
        <p className="flex items-center gap-1.5 text-xs text-brand-dark">
          <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">
            Đã chọn vị trí: {selectedLabel || selectedPlaceId}
          </span>
        </p>
      ) : null}

      {showDropdown && status === "error" && errorMessage ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden="true" />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      {isListboxOpen ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Gợi ý địa chỉ TP.HCM"
          className="max-h-56 overflow-y-auto rounded-xl border border-border-subtle bg-white p-1 shadow-lg"
        >
          {suggestions.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-500">
              Không tìm thấy địa chỉ phù hợp. Vui lòng thử từ khóa khác.
            </p>
          ) : (
            suggestions.map((item, index) => {
              const isSelected =
                item.placeId === selectedPlaceId || index === activeIndex;
              return (
                <Button
                  key={item.placeId}
                  id={`${id}-option-${index}`}
                  type="button"
                  variant="ghost"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(item)}
                  className="h-auto w-full cursor-pointer flex-col items-start justify-start gap-0.5 rounded-lg px-3 py-2 text-left whitespace-normal hover:bg-surface-warm aria-selected:bg-surface-warm"
                >
                  <span className="text-xs font-medium text-gray-900">
                    {item.description}
                  </span>
                  <span className="text-[11px] text-gray-500">
                    {item.district}
                  </span>
                </Button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

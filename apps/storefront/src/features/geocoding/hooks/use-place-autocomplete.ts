"use client";

import { useEffect, useRef, useState } from "react";
import type { PlaceSuggestion } from "@/features/geocoding/types/geocoding.types";

const DEFAULT_AUTOCOMPLETE_ERROR =
  "Không thể tải gợi ý địa chỉ. Vui lòng thử lại.";
const MIN_AUTOCOMPLETE_CHARS = 3;
const DEFAULT_DEBOUNCE_MS = 300;

export interface UsePlaceAutocompleteOptions {
  readonly enabled: boolean;
  readonly query: string;
  readonly debounceMs?: number;
  readonly onSessionInvalidated?: () => void;
}

export interface UsePlaceAutocompleteResult {
  readonly status: "idle" | "loading" | "success" | "error";
  readonly suggestions: readonly PlaceSuggestion[];
  readonly errorMessage: string | null;
}

/**
 * Debounced (`>= 300ms`) client hook for `GET /api/geocoding/autocomplete` with
 * minimum 3-character threshold and `AbortController` cancellation.
 */
export function usePlaceAutocomplete({
  enabled,
  query,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  onSessionInvalidated,
}: UsePlaceAutocompleteOptions): UsePlaceAutocompleteResult {
  const effectiveDebounceMs = Math.max(DEFAULT_DEBOUNCE_MS, debounceMs);
  const trimmedQuery = query.trim();
  const canQuery = enabled && trimmedQuery.length >= MIN_AUTOCOMPLETE_CHARS;

  const [state, setState] = useState<{
    readonly status: "loading" | "success" | "error";
    readonly suggestions: readonly PlaceSuggestion[];
    readonly errorMessage: string | null;
    readonly resolvedQuery: string;
  } | null>(null);

  const onSessionInvalidatedRef = useRef(onSessionInvalidated);
  useEffect(() => {
    onSessionInvalidatedRef.current = onSessionInvalidated;
  }, [onSessionInvalidated]);

  useEffect(() => {
    if (!canQuery) {
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setState({
        status: "loading",
        suggestions: [],
        errorMessage: null,
        resolvedQuery: trimmedQuery,
      });

      void fetch(
        `/api/geocoding/autocomplete?q=${encodeURIComponent(trimmedQuery)}`,
        {
          method: "GET",
          credentials: "same-origin",
          signal: controller.signal,
        },
      )
        .then(async (response) => {
          const payload = (await response.json().catch(() => null)) as {
            data?: PlaceSuggestion[];
            message?: string;
            detail?: string;
            sessionInvalidated?: boolean;
          } | null;

          if (controller.signal.aborted) {
            return;
          }

          if (response.ok && Array.isArray(payload?.data)) {
            setState({
              status: "success",
              suggestions: payload.data,
              errorMessage: null,
              resolvedQuery: trimmedQuery,
            });
            return;
          }

          if (payload?.sessionInvalidated) {
            onSessionInvalidatedRef.current?.();
          }

          setState({
            status: "error",
            suggestions: [],
            errorMessage:
              payload?.message ?? payload?.detail ?? DEFAULT_AUTOCOMPLETE_ERROR,
            resolvedQuery: trimmedQuery,
          });
        })
        .catch(() => {
          if (controller.signal.aborted) {
            return;
          }
          setState({
            status: "error",
            suggestions: [],
            errorMessage: DEFAULT_AUTOCOMPLETE_ERROR,
            resolvedQuery: trimmedQuery,
          });
        });
    }, effectiveDebounceMs);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [canQuery, effectiveDebounceMs, trimmedQuery]);

  if (!canQuery) {
    return { status: "idle", suggestions: [], errorMessage: null };
  }

  if (!state || state.resolvedQuery !== trimmedQuery) {
    return { status: "loading", suggestions: [], errorMessage: null };
  }

  return {
    status: state.status,
    suggestions: state.suggestions,
    errorMessage: state.errorMessage,
  };
}

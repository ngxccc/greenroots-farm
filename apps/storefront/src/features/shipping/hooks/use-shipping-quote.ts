"use client";

import { useEffect, useRef, useState } from "react";
import type {
  ShippingQuote,
  ShippingQuoteRequest,
} from "@/features/shipping/types/shipping.types";

const DEFAULT_QUOTE_ERROR_MESSAGE =
  "Không thể tải phí giao hàng. Vui lòng thử lại.";

const shippingQuoteCache = new Map<string, ShippingQuote>();
const inFlightQuoteRequests = new Map<
  string,
  Promise<FetchShippingQuoteResult>
>();

/**
 * Builds a deterministic in-memory cache key for `(addressId | districtCode, isSubscription)`.
 */
export function buildShippingQuoteCacheKey(
  input: ShippingQuoteRequest,
): string {
  const target = input.addressId
    ? `addr:${input.addressId}`
    : `dist:${input.districtCode ?? ""}`;
  return `${target}:sub:${String(Boolean(input.isSubscription))}`;
}

/**
 * Clears the client-side shipping quote cache (e.g. on logout or isolated unit tests).
 */
export function clearShippingQuoteCache(): void {
  shippingQuoteCache.clear();
  inFlightQuoteRequests.clear();
}

/**
 * Result returned by `fetchShippingQuoteFromBff`.
 */
export type FetchShippingQuoteResult =
  | { readonly ok: true; readonly quote: ShippingQuote }
  | {
      readonly ok: false;
      readonly message: string;
      readonly sessionInvalidated: boolean;
    };

/**
 * Calls the Storefront BFF `POST /api/shipping/quote` endpoint with `AbortController` support.
 */
export async function fetchShippingQuoteFromBff(
  input: ShippingQuoteRequest,
  signal?: AbortSignal,
): Promise<FetchShippingQuoteResult> {
  const response = await fetch("/api/shipping/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    credentials: "same-origin",
    signal,
  });

  const payload = (await response.json().catch(() => null)) as {
    data?: ShippingQuote;
    message?: string;
    detail?: string;
    sessionInvalidated?: boolean;
  } | null;

  if (response.ok && payload?.data) {
    return { ok: true, quote: payload.data };
  }

  return {
    ok: false,
    message: payload?.message ?? payload?.detail ?? DEFAULT_QUOTE_ERROR_MESSAGE,
    sessionInvalidated: payload
      ? Boolean(payload.sessionInvalidated)
      : response.status === 401,
  };
}

/**
 * Options for `useShippingQuote`.
 */
export interface UseShippingQuoteOptions {
  readonly enabled: boolean;
  readonly addressId?: string | null;
  readonly districtCode?: string | null;
  readonly isSubscription?: boolean;
  readonly onSessionInvalidated?: () => void;
}

/**
 * State returned by `useShippingQuote`.
 */
export interface UseShippingQuoteResult {
  readonly status: "idle" | "loading" | "success" | "error";
  readonly quote: ShippingQuote | null;
  readonly errorMessage: string | null;
  readonly retry: () => void;
}

/**
 * Client hook for fetching server-computed delivery quotes via `POST /api/shipping/quote`
 * with in-memory `(addressId | districtCode, isSubscription)` caching and `AbortController`
 * cancellation to prevent stale responses during rapid district selection.
 */
export function useShippingQuote({
  enabled,
  addressId,
  districtCode,
  isSubscription = false,
  onSessionInvalidated,
}: UseShippingQuoteOptions): UseShippingQuoteResult {
  const normalizedAddressId = addressId ?? null;
  const normalizedDistrictCode = normalizedAddressId
    ? null
    : (districtCode ?? null);

  const cacheKey = normalizedAddressId
    ? buildShippingQuoteCacheKey({
        addressId: normalizedAddressId,
        isSubscription,
      })
    : normalizedDistrictCode
      ? buildShippingQuoteCacheKey({
          districtCode: normalizedDistrictCode,
          isSubscription,
        })
      : null;

  const [reloadNonce, setReloadNonce] = useState(0);
  const [state, setState] = useState<{
    status: "success" | "error";
    quote: ShippingQuote | null;
    errorMessage: string | null;
    resolvedKey: string;
    resolvedNonce: number;
  } | null>(null);

  const onSessionInvalidatedRef = useRef(onSessionInvalidated);
  useEffect(() => {
    onSessionInvalidatedRef.current = onSessionInvalidated;
  }, [onSessionInvalidated]);

  const cachedQuote =
    enabled && cacheKey ? (shippingQuoteCache.get(cacheKey) ?? null) : null;

  useEffect(() => {
    if (!enabled || !cacheKey) {
      return;
    }

    if (shippingQuoteCache.has(cacheKey)) {
      return;
    }

    const requestBody: ShippingQuoteRequest = normalizedAddressId
      ? { addressId: normalizedAddressId, isSubscription }
      : { districtCode: normalizedDistrictCode ?? undefined, isSubscription };

    let cancelled = false;
    let requestPromise = inFlightQuoteRequests.get(cacheKey);
    if (!requestPromise) {
      requestPromise = fetchShippingQuoteFromBff(requestBody).finally(() => {
        inFlightQuoteRequests.delete(cacheKey);
      });
      inFlightQuoteRequests.set(cacheKey, requestPromise);
    }

    void requestPromise
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (result.ok) {
          shippingQuoteCache.set(cacheKey, result.quote);
          setState({
            status: "success",
            quote: result.quote,
            errorMessage: null,
            resolvedKey: cacheKey,
            resolvedNonce: reloadNonce,
          });
          return;
        }

        if (result.sessionInvalidated) {
          onSessionInvalidatedRef.current?.();
        }
        setState({
          status: "error",
          quote: null,
          errorMessage: result.message,
          resolvedKey: cacheKey,
          resolvedNonce: reloadNonce,
        });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setState({
          status: "error",
          quote: null,
          errorMessage: DEFAULT_QUOTE_ERROR_MESSAGE,
          resolvedKey: cacheKey,
          resolvedNonce: reloadNonce,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    cacheKey,
    reloadNonce,
    normalizedAddressId,
    normalizedDistrictCode,
    isSubscription,
  ]);

  function retry() {
    if (cacheKey) {
      shippingQuoteCache.delete(cacheKey);
    }
    setReloadNonce((n) => n + 1);
  }

  if (!enabled || !cacheKey) {
    return {
      status: "idle",
      quote: null,
      errorMessage: null,
      retry,
    };
  }

  if (cachedQuote) {
    return {
      status: "success",
      quote: cachedQuote,
      errorMessage: null,
      retry,
    };
  }

  if (state?.resolvedKey === cacheKey && state.resolvedNonce === reloadNonce) {
    return {
      status: state.status,
      quote: state.quote,
      errorMessage: state.errorMessage,
      retry,
    };
  }

  return {
    status: "loading",
    quote: null,
    errorMessage: null,
    retry,
  };
}

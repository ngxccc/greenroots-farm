"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface BackLinkProps {
  readonly href: string;
  readonly label?: string;
  readonly className?: string;
}

/**
 * Returns true when browser history has a prior same-origin entry safe for `router.back()`.
 * Empty `referrer` with `historyLength > 1` occurs after SPA `<Link>` transitions and is allowed;
 * cross-origin referrers (e.g. PayOS gateway redirects) fall back to `href`.
 */
export function canNavigateBackInHistory(
  historyLength: number,
  referrer: string,
  currentOrigin: string,
): boolean {
  if (historyLength <= 1) {
    return false;
  }

  if (!referrer) {
    return true;
  }

  try {
    return new URL(referrer).origin === currentOrigin;
  } catch {
    return false;
  }
}

/**
 * Shared back navigation link for Storefront detail and checkout headers.
 * Uses `router.back()` when a safe same-origin history entry exists, falling back to `href`.
 */
export function BackLink({
  href,
  label = "Quay lại",
  className,
}: BackLinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }

    if (
      typeof window !== "undefined" &&
      canNavigateBackInHistory(
        window.history.length,
        document.referrer,
        window.location.origin,
      )
    ) {
      event.preventDefault();
      window.history.back();
    }
  }

  return (
    <div className={className}>
      <Link
        href={href}
        onClick={handleClick}
        className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:outline-none"
      >
        <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </Link>
    </div>
  );
}

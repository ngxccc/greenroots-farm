"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/common/brand-logo";
import { SystemIncidentView } from "@/components/common/system-incident-view";
import { FARM_METADATA } from "@/constants/farm-metadata.constant";

interface GlobalErrorShellProps {
  readonly fontClassName?: string;
  readonly referenceId?: string;
  readonly onRetry?: () => void;
}

/**
 * Minimal standalone shell rendered by `app/global-error.tsx` without coupling
 * to `StorefrontHeader`, `HeaderAuthSlot`, or client state stores.
 */
export function GlobalErrorShell({
  fontClassName = "",
  referenceId,
  onRetry,
}: GlobalErrorShellProps) {
  return (
    <html lang="vi" className={fontClassName}>
      <body className="flex min-h-screen flex-col bg-surface-warm font-sans text-gray-900 antialiased">
        <header className="sticky top-0 z-40 bg-brand-forest text-white shadow-sm">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 lg:px-6">
            <Link
              href="/"
              className="inline-flex items-center rounded focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
            >
              <BrandLogo variant="on-dark" size="md" />
            </Link>
          </div>
        </header>

        <main className="flex flex-1 flex-col">
          <SystemIncidentView
            variant="500"
            referenceId={referenceId}
            onRetry={onRetry}
          />
        </main>

        <footer className="mt-auto border-t border-border-subtle bg-white">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-gray-500 sm:flex-row lg:px-6">
            <span>© 2026 GreenRoots Farm — Từ Nông Trại Hữu Cơ Đến Bàn Ăn</span>
            <span className="font-semibold text-brand-forest tabular-nums">
              Hotline hỗ trợ: {FARM_METADATA.hotline}
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}

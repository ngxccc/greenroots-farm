"use client";

import { Be_Vietnam_Pro } from "next/font/google";
import { useEffect } from "react";
import { GlobalErrorShell } from "@/components/common/global-error-shell";
import "@/styles/globals.css";

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["vietnamese", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-be-vietnam-pro",
  display: "swap",
});

interface GlobalErrorPageProps {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}

/**
 * Root-layout crash fallback rendering a minimal standalone GreenRoots shell
 * decoupled from `HeaderAuthSlot`, `StorefrontHeader`, and client stores.
 */
export default function GlobalErrorPage({
  error,
  reset,
}: GlobalErrorPageProps) {
  useEffect(() => {
    console.error("[StorefrontGlobalError]", {
      digest: error.digest ?? null,
    });
  }, [error.digest]);

  return (
    <GlobalErrorShell
      fontClassName={beVietnamPro.variable}
      referenceId={error.digest}
      onRetry={reset}
    />
  );
}

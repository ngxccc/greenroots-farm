"use client";

import { useEffect } from "react";
import {
  SystemIncidentView,
  classifyClientIncident,
} from "@/components/common/system-incident-view";

interface StorefrontErrorPageProps {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}

/**
 * Route-level client error boundary for `apps/storefront`.
 * Logs sanitized digest metadata and delegates UI rendering without exposing stack traces.
 */
export default function StorefrontErrorPage({
  error,
  reset,
}: StorefrontErrorPageProps) {
  const variant = classifyClientIncident(error);

  useEffect(() => {
    console.error("[StorefrontErrorBoundary]", {
      variant,
      digest: error.digest ?? null,
    });
  }, [error.digest, variant]);

  return (
    <SystemIncidentView
      variant={variant}
      referenceId={error.digest}
      onRetry={reset}
    />
  );
}

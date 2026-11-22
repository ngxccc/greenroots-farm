import type { ReactNode } from "react";
import { StorefrontShell } from "@/components/common/storefront-shell";

/**
 * Shared layout for standard Storefront shopping, traceability, and maintenance pages.
 */
export default function MainStorefrontLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return <StorefrontShell>{children}</StorefrontShell>;
}

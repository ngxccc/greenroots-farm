import { Suspense, type ReactNode } from "react";
import { BackToTopButton } from "@/components/common/back-to-top";
import { StorefrontFooter } from "@/components/common/footer";
import { StorefrontHeader } from "@/components/common/header";
import {
  HeaderAuthSkeleton,
  HeaderAuthSlot,
} from "@/components/common/header-auth-slot";

interface StorefrontShellProps {
  readonly children: ReactNode;
}

/**
 * Shared Storefront shopping chrome wrapping `<main>` with the sticky header,
 * streaming `<Suspense>` auth slot, footer, and back-to-top control.
 */
export function StorefrontShell({ children }: StorefrontShellProps) {
  return (
    <>
      <StorefrontHeader
        authSlot={
          <Suspense fallback={<HeaderAuthSkeleton />}>
            <HeaderAuthSlot />
          </Suspense>
        }
      />
      <main className="flex-1">{children}</main>
      <StorefrontFooter />
      <BackToTopButton />
    </>
  );
}

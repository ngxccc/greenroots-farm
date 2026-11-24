import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import {
  AccountSidebar,
  AccountSidebarSkeleton,
} from "@/features/account/components/account-sidebar";
import { getAccountProfileSession } from "@/lib/auth/session.server";

async function AccountSidebarSlot() {
  // Force per-request dynamic execution before uncached session reads under cacheComponents.
  await connection();
  const resolution = await getAccountProfileSession();
  if (resolution.status !== "authenticated") {
    return null;
  }

  return <AccountSidebar user={resolution.user} />;
}

/**
 * Persistent 2-column customer account layout keeping `AccountSidebar` mounted
 * across sibling `/account/*` navigations without flashing sidebar skeletons.
 */
export default function AccountLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:py-6 lg:px-6 lg:py-8">
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        <Suspense fallback={<AccountSidebarSkeleton />}>
          <AccountSidebarSlot />
        </Suspense>
        <div className="min-w-0 lg:col-span-9">{children}</div>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import {
  AccountAddressesDegradedView,
  AccountAddressesSkeleton,
  AccountAddressesView,
} from "@/features/account/components/account-addresses-view";
import { getAccountAddressesSession } from "@/lib/auth/session.server";

export const metadata: Metadata = {
  title: "Sổ địa chỉ",
  description:
    "Quản lý sổ địa chỉ giao hàng TP.HCM, chọn địa chỉ mặc định và xem khoảng cách ước tính từ nông trại GreenRoots.",
};

async function AccountAddressesGate() {
  // Force per-request dynamic execution before uncached session/API reads under cacheComponents.
  await connection();
  const resolution = await getAccountAddressesSession();

  if (resolution.status === "unauthenticated") {
    redirect("/login?redirect=%2Faccount%2Faddresses");
  }

  if (resolution.status === "degraded") {
    return <AccountAddressesDegradedView />;
  }

  return (
    <AccountAddressesView
      initialUser={resolution.user}
      initialAddresses={resolution.addresses}
    />
  );
}

/**
 * Authenticated customer HCMC delivery address book route (`/account/addresses`).
 */
export default function AccountAddressesPage() {
  return (
    <Suspense fallback={<AccountAddressesSkeleton />}>
      <AccountAddressesGate />
    </Suspense>
  );
}

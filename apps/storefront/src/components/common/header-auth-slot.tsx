import { connection } from "next/server";
import { Skeleton } from "@greenroots/ui";
import { getServerSession } from "@/lib/auth/session.server";
import { HeaderAuthControls } from "./header-auth-controls";

/**
 * Compact skeleton placeholder streamed while `HeaderAuthSlot` resolves `getServerSession()`.
 */
export function HeaderAuthSkeleton() {
  return (
    <Skeleton aria-hidden="true" className="h-8 w-28 rounded-lg bg-white/15" />
  );
}

/**
 * Streaming Server Component slot reading customer identity via `GET /api/v1/users/me`
 * inside a `<Suspense>` boundary so `RootLayout` retains PPR static caching (`INV-SF-AUTH-8`).
 */
export async function HeaderAuthSlot() {
  await connection();
  const user = await getServerSession();
  return <HeaderAuthControls initialUser={user} />;
}

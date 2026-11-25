import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { VerifyEmailPanel } from "@/features/auth/components/verify-email-panel";
import {
  extractFirstQueryValue,
  parsePrefillEmailParam,
  parseRecoveryTokenParam,
} from "@/features/auth/schemas/auth-validation";
import { getServerSession } from "@/features/auth/services/session.server";
import type { StorefrontSessionUser } from "@/features/auth/types/auth.types";

/**
 * Query parameters supported on the Storefront `/verify-email` route.
 */
export interface VerifyEmailSearchParams {
  readonly token?: string | string[];
  readonly email?: string | string[];
}

/**
 * Optional dependency overrides for isolated unit testing of `resolveVerifyEmailGate`.
 */
export interface VerifyEmailGateDeps {
  readonly readSession?: () => Promise<StorefrontSessionUser | null>;
  readonly onRedirect?: (target: string) => never;
}

/**
 * Evaluates `/verify-email` query parameters and redirects authenticated sessions
 * away from tokenless or malformed-token visits while keeping valid email-link tokens accessible.
 *
 * @param searchParams Async Next.js `searchParams` promise from `/verify-email`.
 * @param deps Optional injectable session reader and redirect handler for tests.
 * @returns Rendered `<VerifyEmailPanel>` node or invokes `redirect("/")` for authenticated tokenless visits.
 */
export async function resolveVerifyEmailGate(
  searchParams: Promise<VerifyEmailSearchParams>,
  deps?: VerifyEmailGateDeps,
): Promise<ReactNode> {
  const resolved = await searchParams;
  const hasTokenParam = extractFirstQueryValue(resolved.token) !== undefined;
  const token = parseRecoveryTokenParam(resolved.token);

  // Skip upstream session lookup when a structurally valid token is present so email-link clicks stay fast and accessible.
  if (token === null) {
    const readSession = deps?.readSession ?? getServerSession;
    const session = await readSession();
    if (session) {
      return (deps?.onRedirect ?? redirect)("/");
    }
  }

  const prefillEmail = parsePrefillEmailParam(resolved.email);

  return (
    <VerifyEmailPanel
      key={`${token ?? (hasTokenParam ? "invalid" : "standalone")}:${prefillEmail}`}
      token={token}
      hasTokenParam={hasTokenParam}
      prefillEmail={prefillEmail}
    />
  );
}

/**
 * Async Server Component running inside `<Suspense>` (`cacheComponents: true`)
 * that redirects authenticated customers away from tokenless `/verify-email` to `/`.
 */
export async function VerifyEmailGate({
  searchParams,
  deps,
}: {
  readonly searchParams: Promise<VerifyEmailSearchParams>;
  readonly deps?: VerifyEmailGateDeps;
}) {
  if (!deps?.readSession) {
    await connection();
  }
  return resolveVerifyEmailGate(searchParams, deps);
}

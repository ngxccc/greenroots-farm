import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Skeleton } from "@greenroots/ui";
import { sanitizeRedirectPath } from "@/lib/auth/cookies";
import { getServerSession } from "@/lib/auth/session.server";
import type { StorefrontSessionUser } from "@/types/auth.types";

/**
 * Query parameters supported on Storefront authentication routes.
 */
export interface AuthSearchParams {
  readonly redirect?: string | string[];
}

interface AuthRedirectGateProps {
  readonly searchParams: Promise<AuthSearchParams>;
  readonly renderForm: (redirectTo: string) => ReactNode;
  readonly deps?: AuthRedirectGateDeps;
}

/**
 * Optional dependency overrides for isolated unit testing of `resolveAuthRedirectGate`.
 */
export interface AuthRedirectGateDeps {
  readonly readSession?: () => Promise<StorefrontSessionUser | null>;
  readonly onRedirect?: (target: string) => never;
}

/**
 * Extracts a single candidate redirect value from Next.js `searchParams`.
 */
export function resolveRedirectCandidate(
  param: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(param)) {
    return param[0];
  }
  return param;
}

/**
 * Evaluates session state and sanitized redirect target for auth pages.
 * Exposed for unit testing; auth page components render `<AuthRedirectGate>` inside `<Suspense>`.
 */
export async function resolveAuthRedirectGate(
  searchParams: Promise<AuthSearchParams>,
  renderForm: (redirectTo: string) => ReactNode,
  deps?: AuthRedirectGateDeps,
): Promise<ReactNode> {
  const readSession = deps?.readSession ?? getServerSession;
  const [session, resolvedParams] = await Promise.all([
    readSession(),
    searchParams,
  ]);
  const safeRedirect = sanitizeRedirectPath(
    resolveRedirectCandidate(resolvedParams.redirect),
  );

  if (session) {
    return (deps?.onRedirect ?? redirect)(safeRedirect);
  }

  return renderForm(safeRedirect);
}

/**
 * Async Server Component running inside `<Suspense>` (`cacheComponents: true`)
 * that redirects authenticated customers away from `/login` and `/register`
 * to the sanitized target path.
 */
export async function AuthRedirectGate({
  searchParams,
  renderForm,
  deps,
}: AuthRedirectGateProps) {
  return resolveAuthRedirectGate(searchParams, renderForm, deps);
}

/**
 * Lightweight skeleton displayed while `<AuthRedirectGate>` checks session state.
 */
export function AuthFormSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-5">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48 rounded-lg" />
        <Skeleton className="h-4 w-72 rounded" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-11 w-full rounded-lg" />
        <Skeleton className="h-11 w-full rounded-lg" />
        <Skeleton className="h-11 w-full rounded-lg" />
      </div>
    </div>
  );
}

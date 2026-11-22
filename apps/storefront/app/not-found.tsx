import { NotFoundView } from "@/components/common/not-found-view";
import { StorefrontShell } from "@/components/common/storefront-shell";

/**
 * Branded Storefront 404 screen providing catalog search and quick links to shopping flows.
 */
export default function NotFoundPage() {
  return (
    <StorefrontShell>
      <NotFoundView />
    </StorefrontShell>
  );
}

import { StorefrontShell } from "@/components/common/storefront-shell";
import { SystemIncidentView } from "@/components/common/system-incident-view";

/**
 * Renders the branded 403 access-denied view when a server route calls `forbidden()`.
 */
export default function ForbiddenPage() {
  return (
    <StorefrontShell>
      <SystemIncidentView variant="403" />
    </StorefrontShell>
  );
}

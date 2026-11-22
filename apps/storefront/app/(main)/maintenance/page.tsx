import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { SystemIncidentView } from "@/components/common/system-incident-view";
import { isMaintenanceModeEnabled } from "@/env";

/**
 * Optional dependency overrides for unit testing `renderMaintenanceRoute`.
 */
export interface MaintenanceRouteDeps {
  readonly checkConnection?: () => Promise<void>;
  readonly isEnabled?: () => boolean;
  readonly onNotFound?: () => never;
}

/**
 * Evaluates maintenance mode for `/maintenance` after opting into dynamic rendering,
 * invoking `notFound()` when maintenance mode is inactive.
 *
 * @param deps Optional injectable connection, env check, and not-found handler.
 * @returns Rendered maintenance view element when maintenance mode is enabled.
 */
export async function renderMaintenanceRoute(
  deps?: MaintenanceRouteDeps,
): Promise<ReactNode> {
  await (deps?.checkConnection ?? connection)();
  const enabled = (deps?.isEnabled ?? isMaintenanceModeEnabled)();
  if (!enabled) {
    return (deps?.onNotFound ?? notFound)();
  }

  return <SystemIncidentView variant="maintenance" />;
}

async function MaintenanceContent() {
  return renderMaintenanceRoute();
}

/**
 * Scheduled maintenance page served via `503` proxy rewrite when `MAINTENANCE_MODE=true`.
 *
 * @returns Suspense-wrapped maintenance view or `404` when inactive.
 */
export default function MaintenancePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-4 py-10 text-center text-sm text-gray-500 lg:px-6">
          Đang kiểm tra trạng thái hệ thống...
        </div>
      }
    >
      <MaintenanceContent />
    </Suspense>
  );
}

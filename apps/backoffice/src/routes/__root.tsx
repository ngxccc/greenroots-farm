import { Toaster } from "@greenroots/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  Outlet,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { BackofficeShell } from "@/components/layout/backoffice-shell";
import {
  getDefaultRouteForRole,
  useAuthStore,
} from "@/features/auth/stores/auth.store";
import {
  ensureStaffSession,
  setUnauthorizedRedirectHandler,
} from "@/lib/api-client";

const PUBLIC_AUTH_PATHS = new Set([
  "/login",
  "/forgot-password",
  "/reset-password",
]);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function RootComponent() {
  const navigate = useNavigate();

  useEffect(() => {
    setUnauthorizedRedirectHandler(() => {
      const currentPath = window.location.pathname;
      if (!PUBLIC_AUTH_PATHS.has(currentPath)) {
        void navigate({ to: "/login" });
      }
    });
  }, [navigate]);

  return (
    <QueryClientProvider client={queryClient}>
      <BackofficeShell>
        <Outlet />
      </BackofficeShell>
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  );
}

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    const isPublicAuth = PUBLIC_AUTH_PATHS.has(location.pathname);

    if (!isPublicAuth) {
      const hasSession = await ensureStaffSession();
      if (!hasSession) {
        // oxlint-disable-next-line typescript/only-throw-error
        throw redirect({ to: "/login" });
      }
      return;
    }

    if (location.pathname === "/login") {
      const hasSession = await ensureStaffSession();
      if (hasSession) {
        const role = useAuthStore.getState().user?.role;
        if (role) {
          // oxlint-disable-next-line typescript/only-throw-error
          throw redirect({ to: getDefaultRouteForRole(role) });
        }
      }
    }
  },
  component: RootComponent,
});

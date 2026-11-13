import { Toaster } from "@greenroots/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { BackofficeShell } from "@/components/layout/backoffice-shell";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export const Route = createRootRoute({
  component: () => (
    <QueryClientProvider client={queryClient}>
      <BackofficeShell>
        <Outlet />
      </BackofficeShell>
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  ),
});

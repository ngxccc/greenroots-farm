import { createFileRoute, Navigate } from "@tanstack/react-router";
import { getDefaultRouteForRole, useAuthStore } from "@/stores/auth.store";

export const Route = createFileRoute("/")({
  component: IndexRedirect,
});

function IndexRedirect() {
  const user = useAuthStore((state) => state.user);
  if (!user) {
    return <Navigate to="/login" />;
  }
  return <Navigate to={getDefaultRouteForRole(user.role)} />;
}

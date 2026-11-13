import createClient, { type Middleware } from "openapi-fetch";
import { useAuthStore } from "@/stores/auth.store";
import type { paths } from "@/types/api-schema";

const bearerMiddleware: Middleware = {
  onRequest({ request }) {
    const token = useAuthStore.getState().accessToken;
    if (token && !request.headers.has("Authorization")) {
      request.headers.set("Authorization", `Bearer ${token}`);
    }
    return request;
  },
};

export const api = createClient<paths>({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? "",
});

api.use(bearerMiddleware);

export interface ApiHealthStatus {
  readonly reachable: boolean;
  readonly message: string;
}

export async function fetchApiHealth(): Promise<ApiHealthStatus> {
  try {
    const { data } = await api.GET("/api/v1/health");
    if (!data) {
      return { reachable: false, message: "API tạm thời chưa phản hồi" };
    }
    return { reachable: true, message: data.data.message };
  } catch {
    return { reachable: false, message: "Chưa kết nối tới API :3000" };
  }
}

import { api } from "@/lib/api-client";

/**
 * Checks live connectivity to the GreenRoots NestJS API (`/api/v1/health`).
 *
 * @returns Reachability flag and localized status message.
 */
export async function fetchApiHealth(): Promise<{
  reachable: boolean;
  message: string;
}> {
  try {
    const { data } = await api.GET("/api/v1/health");
    if (!data) {
      return {
        reachable: false,
        message: "Máy chủ API tạm thời chưa phản hồi",
      };
    }
    return {
      reachable: true,
      message: data.data.message,
    };
  } catch {
    return {
      reachable: false,
      message: "Chưa kết nối tới máy chủ API",
    };
  }
}

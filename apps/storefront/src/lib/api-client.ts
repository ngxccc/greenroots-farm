import { cookies } from "next/headers";
import createClient, { type Middleware } from "openapi-fetch";
import { env } from "@/env";
import type { ApiProblemDetails } from "@/types/api";
import type { paths } from "@/types/api-schema";

/**
 * Typed HTTP error carrying RFC 9457 Problem Details when available.
 */
export class ApiClientError extends Error {
  public readonly status: number;
  public readonly problem?: ApiProblemDetails;

  constructor(message: string, status: number, problem?: ApiProblemDetails) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.problem = problem;
  }
}

const PUBLIC_API_PREFIXES = [
  "/health",
  "/products",
  "/categories",
  "/farms",
  "/trace",
  "/subscription-plans",
];

const serverCookieBridgeMiddleware: Middleware = {
  async onRequest({ request }) {
    if (typeof window !== "undefined") {
      throw new ApiClientError(
        "Direct API calls from the browser are disabled; use Next.js Server Actions.",
        500,
      );
    }

    const url = new URL(request.url);
    const normalizedPath = url.pathname.replace(/^\/api\/v1/, "");
    const isPublicRoute = PUBLIC_API_PREFIXES.some((prefix) =>
      normalizedPath.startsWith(prefix),
    );
    if (isPublicRoute) {
      return request;
    }

    try {
      const cookieStore = await cookies();
      const accessToken = cookieStore.get("accessToken")?.value;
      if (accessToken && !request.headers.has("Authorization")) {
        request.headers.set("Authorization", `Bearer ${accessToken}`);
      }
    } catch {
      // Cookies are unavailable outside an active Next.js request scope (e.g. build/tests).
    }

    return request;
  },
};

/**
 * Strictly server-side OpenAPI client with automatic `httpOnly` cookie bridging (Q28).
 */
export const api = createClient<paths>({
  baseUrl: env.BACKEND_API_URL,
});

api.use(serverCookieBridgeMiddleware);

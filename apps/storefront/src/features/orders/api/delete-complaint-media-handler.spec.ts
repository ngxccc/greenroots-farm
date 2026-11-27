import { describe, expect, it } from "bun:test";
import { API_ERROR_CODES } from "@greenroots/shared";
import { handleComplaintMediaDelete } from "./delete-complaint-media-handler";

const APP_URL = "http://localhost:3001";
const SAMPLE_IMAGE_URL =
  "https://res.cloudinary.com/greenroots/image/upload/v1/complaints/user-1/abc.webp";

function buildDeleteRequest(
  urlParam = SAMPLE_IMAGE_URL,
  resourceType = "image",
  origin = APP_URL,
): Request {
  const query = new URLSearchParams({
    url: urlParam,
    resourceType,
  }).toString();
  return new Request(`${APP_URL}/api/media/complaints?${query}`, {
    method: "DELETE",
    headers: { origin },
  });
}

describe("Complaint Media Delete BFF Handler", () => {
  describe("handleComplaintMediaDelete", () => {
    it("rejects cross-origin delete requests before reading session cookies", async () => {
      const response = await handleComplaintMediaDelete(
        buildDeleteRequest(SAMPLE_IMAGE_URL, "image", "https://evil.example"),
        { allowedAppUrl: APP_URL },
      );

      expect(response.status).toBe(403);
      const json = (await response.json()) as { code?: string };
      expect(json.code).toBe(API_ERROR_CODES.FORBIDDEN);
    });

    it("rejects unauthenticated delete requests when both tokens are missing", async () => {
      const response = await handleComplaintMediaDelete(buildDeleteRequest(), {
        allowedAppUrl: APP_URL,
        readTokens: () => Promise.resolve({}),
      });

      expect(response.status).toBe(401);
      const json = (await response.json()) as {
        code?: string;
        sessionInvalidated?: boolean;
      };
      expect(json.code).toBe(API_ERROR_CODES.UNAUTHORIZED);
      expect(json.sessionInvalidated).toBe(true);
    });

    it("forwards valid delete query and returns empty success response when authenticated", async () => {
      let capturedQuery: { url: string; resourceType: string } | undefined;
      const response = await handleComplaintMediaDelete(buildDeleteRequest(), {
        allowedAppUrl: APP_URL,
        readTokens: () =>
          Promise.resolve({ accessToken: "token", refreshToken: "refresh" }),
        runWithRefresh: async (op) => ({
          ...(await op()),
          refreshOutcome: "not_needed",
        }),
        deleteMedia: (query) => {
          capturedQuery = query;
          return Promise.resolve({
            response: new Response(null, { status: 204 }),
          });
        },
      });

      expect(capturedQuery).toEqual({
        url: SAMPLE_IMAGE_URL,
        resourceType: "image",
      });
      expect(response.status).toBe(204);
    });

    it("maps upstream conflict when media belongs to a submitted complaint", async () => {
      const response = await handleComplaintMediaDelete(buildDeleteRequest(), {
        allowedAppUrl: APP_URL,
        readTokens: () =>
          Promise.resolve({ accessToken: "token", refreshToken: "refresh" }),
        runWithRefresh: async (op) => ({
          ...(await op()),
          refreshOutcome: "not_needed",
        }),
        deleteMedia: () =>
          Promise.resolve({
            response: new Response(null, { status: 409 }),
            error: {
              code: API_ERROR_CODES.CONFLICT,
              status: 409,
              detail: "Media is already linked to a submitted complaint.",
            },
          }),
      });

      expect(response.status).toBe(409);
      const json = (await response.json()) as { code?: string };
      expect(json.code).toBe(API_ERROR_CODES.CONFLICT);
    });
  });
});

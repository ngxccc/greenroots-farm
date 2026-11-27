import { describe, expect, it } from "bun:test";
import { API_ERROR_CODES } from "@greenroots/shared";
import { handleUploadSignaturePost } from "./upload-signature-handler";

const APP_URL = "http://localhost:3001";

function buildPostRequest(body: unknown, origin = APP_URL): Request {
  return new Request(`${APP_URL}/api/media/upload-signature`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("Upload Signature BFF Handler", () => {
  describe("handleUploadSignaturePost", () => {
    it("rejects cross-origin requests before reading session cookies", async () => {
      const response = await handleUploadSignaturePost(
        buildPostRequest(
          { resourceType: "image", fileSizeBytes: 1024 },
          "https://evil.example",
        ),
        { allowedAppUrl: APP_URL },
      );

      expect(response.status).toBe(403);
      const json = (await response.json()) as { code?: string };
      expect(json.code).toBe(API_ERROR_CODES.FORBIDDEN);
    });

    it("rejects unauthenticated requests when both tokens are missing", async () => {
      const response = await handleUploadSignaturePost(
        buildPostRequest({ resourceType: "image", fileSizeBytes: 1024 }),
        {
          allowedAppUrl: APP_URL,
          readTokens: () => Promise.resolve({}),
        },
      );

      expect(response.status).toBe(401);
      const json = (await response.json()) as {
        code?: string;
        sessionInvalidated?: boolean;
      };
      expect(json.code).toBe(API_ERROR_CODES.UNAUTHORIZED);
      expect(json.sessionInvalidated).toBe(true);
    });

    it("forwards complaints folder signature request when authenticated", async () => {
      let capturedFolder: string | undefined;
      const response = await handleUploadSignaturePost(
        buildPostRequest({ resourceType: "image", fileSizeBytes: 2048 }),
        {
          allowedAppUrl: APP_URL,
          readTokens: () =>
            Promise.resolve({ accessToken: "token", refreshToken: "refresh" }),
          runWithRefresh: async (op) => ({
            ...(await op()),
            refreshOutcome: "not_needed",
          }),
          postSignature: (body) => {
            capturedFolder = body.folder;
            return Promise.resolve({
              response: new Response(null, { status: 200 }),
              data: {
                data: {
                  signature: "sig-123",
                  timestamp: 1700000000,
                  cloudName: "greenroots",
                  apiKey: "key-123",
                  folder: "complaints",
                  resourceType: "image",
                  maxBytes: 5_242_880,
                },
              },
            });
          },
        },
      );

      expect(capturedFolder).toBe("complaints");
      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        success?: boolean;
        data?: { folder?: string };
      };
      expect(json.success).toBe(true);
      expect(json.data?.folder).toBe("complaints");
    });

    it("maps transient refresh failure to fallback error", async () => {
      const response = await handleUploadSignaturePost(
        buildPostRequest({ resourceType: "video", fileSizeBytes: 5_000_000 }),
        {
          allowedAppUrl: APP_URL,
          readTokens: () =>
            Promise.resolve({ accessToken: "token", refreshToken: "refresh" }),
          runWithRefresh: () =>
            Promise.resolve({
              response: new Response(null, { status: 401 }),
              error: { code: API_ERROR_CODES.UNAUTHORIZED },
              refreshOutcome: "transient_error",
            }),
        },
      );

      expect(response.status).toBe(503);
      const json = (await response.json()) as { code?: string };
      expect(json.code).toBe(API_ERROR_CODES.SERVICE_UNAVAILABLE);
    });
  });
});

import { describe, expect, it } from "bun:test";
import { API_ERROR_CODES } from "@greenroots/shared";
import { handleGeocodingAutocompleteGet } from "./autocomplete-handler";

describe("handleGeocodingAutocompleteGet", () => {
  it("rejects queries shorter than 3 characters", async () => {
    const req = new Request(
      "http://localhost:3001/api/geocoding/autocomplete?q=ab",
    );
    const res = await handleGeocodingAutocompleteGet(req, {
      readTokens: () => Promise.resolve({ accessToken: "tok" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
  });

  it("rejects unauthenticated requests and flags session invalidation", async () => {
    const req = new Request(
      "http://localhost:3001/api/geocoding/autocomplete?q=Nguyen%20Van%20Linh",
    );
    const res = await handleGeocodingAutocompleteGet(req, {
      readTokens: () => Promise.resolve({}),
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as {
      code: string;
      sessionInvalidated?: boolean;
    };
    expect(body.code).toBe(API_ERROR_CODES.UNAUTHORIZED);
    expect(body.sessionInvalidated).toBe(true);
  });

  it("forwards valid queries for authenticated customers and returns suggestions", async () => {
    const suggestions = [
      {
        placeId: "mock_place_quan_7",
        description: "12 Nguyễn Văn Linh, Quận 7, TP. Hồ Chí Minh",
        ward: "Phường Tân Phú",
      },
    ];
    const req = new Request(
      "http://localhost:3001/api/geocoding/autocomplete?q=Nguyen%20Van%20Linh",
    );

    const res = await handleGeocodingAutocompleteGet(req, {
      readTokens: () => Promise.resolve({ accessToken: "tok" }),
      runWithRefresh: (fn) => fn(),
      fetchAutocomplete: (q) => {
        expect(q).toBe("Nguyen Van Linh");
        return Promise.resolve({
          response: new Response(null, { status: 200 }),
          data: { data: suggestions },
        });
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: typeof suggestions };
    expect(body.data).toEqual(suggestions);
  });
});

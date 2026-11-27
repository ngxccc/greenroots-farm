import { describe, expect, it } from "bun:test";
import { createHmac } from "node:crypto";
import { PAYOS_API_BASE_URL } from "../payments.constant";
import { PayOSAdapter } from "./payos.adapter";

const TEST_CREDS = {
  clientId: "test-client-id-secret",
  apiKey: "test-api-key-secret",
  checksumKey: "test-checksum-key-secret",
} as const;

function readRequestUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

async function expectErrorMessage(
  promise: Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  try {
    await promise;
    expect.unreachable("Expected promise to reject");
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(pattern);
  }
}

describe("PayOSAdapter", () => {
  describe("createPaymentLink", () => {
    it("sends signed request with PayOS headers and returns link metadata", async () => {
      // Invariant: INV-PAY-3, INV-PAY-5
      let capturedUrl = "";
      let capturedInit: RequestInit | undefined;

      const mockFetch = (input: string | URL | Request, init?: RequestInit) => {
        capturedUrl = readRequestUrl(input);
        capturedInit = init;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              code: "00",
              desc: "success",
              data: {
                checkoutUrl: "https://pay.payos.vn/web/abc123",
                paymentLinkId: "pl-123",
                orderCode: 9001,
                qrCode: "000201010212...",
                status: "PENDING",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      };

      const adapter = PayOSAdapter.withCredentials(TEST_CREDS, mockFetch);
      const result = await adapter.createPaymentLink({
        orderCode: 9001,
        amountVnd: 185_000,
        description: "GRF-9001",
        returnUrl: "https://greenroots.farm/orders/return",
        cancelUrl: "https://greenroots.farm/orders/cancel",
      });

      expect(capturedUrl).toBe(`${PAYOS_API_BASE_URL}/v2/payment-requests`);
      expect(capturedInit?.method).toBe("POST");
      expect(capturedInit?.signal).toBeInstanceOf(AbortSignal);

      const headers = capturedInit?.headers as Record<string, string>;
      expect(headers["x-client-id"]).toBe(TEST_CREDS.clientId);
      expect(headers["x-api-key"]).toBe(TEST_CREDS.apiKey);

      const parsedBody = JSON.parse(
        typeof capturedInit?.body === "string" ? capturedInit.body : "",
      ) as Record<string, unknown>;
      const expectedSig = createHmac("sha256", TEST_CREDS.checksumKey)
        .update(
          "amount=185000&cancelUrl=https://greenroots.farm/orders/cancel&description=GRF-9001&orderCode=9001&returnUrl=https://greenroots.farm/orders/return",
        )
        .digest("hex");
      expect(parsedBody["signature"]).toBe(expectedSig);

      expect(result).toEqual({
        checkoutUrl: "https://pay.payos.vn/web/abc123",
        paymentLinkId: "pl-123",
        orderCode: 9001,
        qrCode: "000201010212...",
        status: "PENDING",
      });
    });

    it("throws sanitized error without leaking credentials on timeout or non-2xx", async () => {
      // Invariant: INV-PAY-5
      const timeoutFetch = () => {
        const err = new Error("The operation timed out.");
        err.name = "TimeoutError";
        return Promise.reject(err);
      };

      const timeoutAdapter = PayOSAdapter.withCredentials(
        TEST_CREDS,
        timeoutFetch,
      );
      await expectErrorMessage(
        timeoutAdapter.createPaymentLink({
          orderCode: 9002,
          amountVnd: 100_000,
          description: "GRF-9002",
          returnUrl: "https://greenroots.farm/return",
          cancelUrl: "https://greenroots.farm/cancel",
        }),
        /timed out/,
      );

      const errorFetch = () =>
        Promise.resolve(new Response("Unauthorized", { status: 401 }));
      const errorAdapter = PayOSAdapter.withCredentials(TEST_CREDS, errorFetch);

      try {
        await errorAdapter.createPaymentLink({
          orderCode: 9003,
          amountVnd: 100_000,
          description: "GRF-9003",
          returnUrl: "https://greenroots.farm/return",
          cancelUrl: "https://greenroots.farm/cancel",
        });
        expect.unreachable("Expected createPaymentLink to throw");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        expect(message).toContain("401");
        expect(message).not.toContain(TEST_CREDS.clientId);
        expect(message).not.toContain(TEST_CREDS.apiKey);
        expect(message).not.toContain(TEST_CREDS.checksumKey);
      }
    });
  });

  describe("verifyWebhook", () => {
    it("verifies valid PayOS canonical HMAC-SHA256 signature with nested keys and nulls", async () => {
      // Invariant: INV-PAY-4
      const data = {
        orderCode: 123,
        amount: 3000,
        description: "VQRIO123",
        accountNumber: "12345678",
        reference: "TF230204212323",
        transactionDateTime: "2023-02-04 18:25:00",
        currency: "VND",
        paymentLinkId: "124c33293c43417ab7879e14c8d9eb18",
        code: "00",
        desc: "Thành công",
        counterAccountBankId: null,
        counterAccountBankName: "null",
        omittedField: undefined,
        extra: { z: 1, a: 2 },
        tags: [{ b: 2, a: 1 }],
      };

      const canonical =
        `accountNumber=12345678` +
        `&amount=3000` +
        `&code=00` +
        `&counterAccountBankId=` +
        `&counterAccountBankName=` +
        `&currency=VND` +
        `&desc=Thành công` +
        `&description=VQRIO123` +
        `&extra={"a":2,"z":1}` +
        `&orderCode=123` +
        `&paymentLinkId=124c33293c43417ab7879e14c8d9eb18` +
        `&reference=TF230204212323` +
        `&tags=[{"a":1,"b":2}]` +
        `&transactionDateTime=2023-02-04 18:25:00`;

      const signature = createHmac("sha256", TEST_CREDS.checksumKey)
        .update(canonical)
        .digest("hex");

      const adapter = PayOSAdapter.withCredentials(TEST_CREDS);
      const verified = await adapter.verifyWebhook({
        code: "00",
        desc: "success",
        success: true,
        data,
        signature,
      });

      expect(verified.orderCode).toBe(123);
      expect(verified.amountVnd).toBe(3000);
      expect(verified.counterAccountBankId).toBeNull();
      expect(verified.reference).toBe("TF230204212323");
    });

    it("rejects tampered payloads, mismatched signatures, and non-hex signatures", async () => {
      // Invariant: INV-PAY-4
      const adapter = PayOSAdapter.withCredentials(TEST_CREDS);
      const validData = {
        orderCode: 123,
        amount: 3000,
        description: "GRF-123",
      };
      const canonical = "amount=3000&description=GRF-123&orderCode=123";
      const validSignature = createHmac("sha256", TEST_CREDS.checksumKey)
        .update(canonical)
        .digest("hex");

      await expectErrorMessage(
        adapter.verifyWebhook({
          code: "00",
          desc: "success",
          data: { ...validData, amount: 9999 },
          signature: validSignature,
        }),
        /signature/,
      );

      await expectErrorMessage(
        adapter.verifyWebhook({
          code: "00",
          desc: "success",
          data: validData,
          signature: "not-hex-signature!",
        }),
        /signature/,
      );

      await expectErrorMessage(
        adapter.verifyWebhook({
          code: "00",
          desc: "success",
          data: validData,
          signature: "abcd",
        }),
        /signature/,
      );
    });
  });

  describe("cancelPaymentLink", () => {
    it("posts cancellation request and returns updated link status", async () => {
      // Invariant: INV-PAY-5
      let capturedUrl = "";
      const mockFetch = (input: string | URL | Request) => {
        capturedUrl = readRequestUrl(input);
        return Promise.resolve(
          new Response(
            JSON.stringify({
              code: "00",
              desc: "success",
              data: {
                id: "pl-9001",
                orderCode: 9001,
                status: "CANCELLED",
                canceledAt: "2026-11-25T15:00:00Z",
                cancellationReason: "Expired",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      };

      const adapter = PayOSAdapter.withCredentials(TEST_CREDS, mockFetch);
      const result = await adapter.cancelPaymentLink(9001, "Expired");

      expect(capturedUrl).toBe(
        `${PAYOS_API_BASE_URL}/v2/payment-requests/9001/cancel`,
      );
      expect(result).toEqual({
        paymentLinkId: "pl-9001",
        orderCode: 9001,
        status: "CANCELLED",
        canceledAt: "2026-11-25T15:00:00Z",
        cancellationReason: "Expired",
      });
    });

    it("throws when PayOS returns a non-zero gateway code", async () => {
      const mockFetch = () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              code: "231",
              desc: "Payment link not found",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );

      const adapter = PayOSAdapter.withCredentials(TEST_CREDS, mockFetch);
      await expectErrorMessage(adapter.cancelPaymentLink(9001), /231/);
    });

    it("throws a sanitized error when PayOS returns a non-JSON response", async () => {
      // Invariant: INV-PAY-5
      const mockFetch = () =>
        Promise.resolve(
          new Response("<html>Bad Gateway</html>", {
            status: 200,
            headers: { "Content-Type": "text/html" },
          }),
        );

      const adapter = PayOSAdapter.withCredentials(TEST_CREDS, mockFetch);
      await expectErrorMessage(adapter.cancelPaymentLink(9001), /invalid JSON/);
    });
  });

  describe("getPaymentLinkInfo", () => {
    it("queries GET /v2/payment-requests/{orderCode} with PayOS headers and normalizes PAID status", async () => {
      let capturedUrl = "";
      let capturedMethod = "";
      let capturedHeaders: Record<string, string> = {};

      const mockFetch = (input: string | URL | Request, init?: RequestInit) => {
        capturedUrl =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        capturedMethod = init?.method ?? "GET";
        capturedHeaders = init?.headers as Record<string, string>;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              code: "00",
              desc: "success",
              data: {
                id: "link_9001",
                orderCode: 9001,
                amount: 185000,
                amountPaid: 185000,
                amountRemaining: 0,
                status: "PAID",
                transactions: [{ reference: "FT26331001" }],
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      };

      const adapter = PayOSAdapter.withCredentials(TEST_CREDS, mockFetch);
      const info = await adapter.getPaymentLinkInfo(9001);

      expect(capturedUrl).toBe(
        `${PAYOS_API_BASE_URL}/v2/payment-requests/9001`,
      );
      expect(capturedMethod).toBe("GET");
      expect(capturedHeaders["x-client-id"]).toBe(TEST_CREDS.clientId);
      expect(capturedHeaders["x-api-key"]).toBe(TEST_CREDS.apiKey);
      expect(info.paymentLinkId).toBe("link_9001");
      expect(info.status).toBe("PAID");
      expect(info.amountPaidVnd).toBe(185000);
      expect(info.transactions).toHaveLength(1);
    });
  });
});

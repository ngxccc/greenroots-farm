const PAYOS_CONFIRM_WEBHOOK_URL =
  "https://api-merchant.payos.vn/confirm-webhook";
const WEBHOOK_ROUTE_PATH = "/api/v1/payments/payos/webhook";
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Resolves and validates a public HTTPS webhook URL for PayOS `confirm-webhook`.
 * Appends `/api/v1/payments/payos/webhook` automatically when only an origin is supplied.
 */
export function resolvePayosWebhookUrl(rawInput: string | undefined): string {
  const trimmed = rawInput?.trim();
  if (!trimmed) {
    throw new Error(
      "Missing target URL. Pass a base or full HTTPS URL as the first argument, e.g.:\n  doppler run -- bun --cwd apps/api run payos:confirm-webhook https://xxxx.trycloudflare.com",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid URL: ${trimmed}`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error("PayOS requires a public HTTPS webhook URL (https://...).");
  }

  if (parsed.pathname === "/" || parsed.pathname === "") {
    parsed.pathname = WEBHOOK_ROUTE_PATH;
  }

  return parsed.toString();
}

/**
 * Registers and verifies a public HTTPS webhook URL with PayOS (`POST /confirm-webhook`).
 */
export async function confirmPayosWebhook(
  rawUrl: string | undefined,
): Promise<string> {
  const clientId = process.env["PAYOS_CLIENT_ID"]?.trim();
  const apiKey = process.env["PAYOS_API_KEY"]?.trim();

  if (!clientId || !apiKey) {
    throw new Error(
      "PAYOS_CLIENT_ID and PAYOS_API_KEY are required. Run via Doppler: doppler run -- bun --cwd apps/api run payos:confirm-webhook <https-url>",
    );
  }

  const webhookUrl = resolvePayosWebhookUrl(rawUrl);

  console.info(`[payos] Confirming webhook URL: ${webhookUrl}`);

  const response = await fetch(PAYOS_CONFIRM_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-client-id": clientId,
      "x-api-key": apiKey,
    },
    body: JSON.stringify({ webhookUrl }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const text = await response.text();
  let parsedBody: { code?: string; desc?: string; data?: unknown } | null =
    null;
  try {
    parsedBody = JSON.parse(text) as {
      code?: string;
      desc?: string;
      data?: unknown;
    };
  } catch {
    // Non-JSON upstream error
  }

  if (!response.ok || (parsedBody && parsedBody.code !== "00")) {
    const code = parsedBody?.code ?? String(response.status);
    const desc = parsedBody?.desc ?? text.slice(0, 200);
    throw new Error(`PayOS confirm-webhook failed (${code}): ${desc}`);
  }

  console.info(
    `[payos] Webhook confirmed successfully (${parsedBody?.desc ?? "ok"}).`,
  );
  return webhookUrl;
}

if (import.meta.main) {
  confirmPayosWebhook(
    process.argv[2] ?? process.env["PAYOS_WEBHOOK_URL"],
  ).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[payos] Error: ${message}`);
    process.exit(1);
  });
}

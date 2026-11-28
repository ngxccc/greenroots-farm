import { confirmPayosWebhook } from "./confirm-payos-webhook";

const DEFAULT_API_PORT = "3000";
const TUNNEL_URL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
const TUNNEL_READY_TIMEOUT_MS = 20_000;
const TUNNEL_PROPAGATION_ATTEMPTS = 10;
const TUNNEL_PROPAGATION_INTERVAL_MS = 1_500;
const PAYOS_CONFIRM_ATTEMPTS = 4;
const PAYOS_CONFIRM_RETRY_MS = 2_500;

function resolvePort(): number {
  const raw = process.argv[2] ?? process.env["PORT"] ?? DEFAULT_API_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`Invalid API port: ${raw}`);
  }
  return port;
}

function assertCloudflaredInstalled(): string {
  const binaryPath = Bun.which("cloudflared");
  if (!binaryPath) {
    throw new Error(
      [
        "`cloudflared` chưa được cài đặt trên máy.",
        "Cài đặt Cloudflare Tunnel CLI trước khi chạy lệnh này:",
        "  • Linux (apt): https://pkg.cloudflare.com/index.html",
        "  • macOS: brew install cloudflared",
        "  • Hoặc tải binary tại: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/",
      ].join("\n"),
    );
  }
  return binaryPath;
}

async function waitForTunnelUrl(
  proc: Bun.Subprocess<"ignore", "pipe", "pipe">,
): Promise<string> {
  const decoder = new TextDecoder();

  const scanStream = async (
    stream: ReadableStream<Uint8Array>,
  ): Promise<string | null> => {
    const reader = stream.getReader();
    let buffer = "";
    try {
      let chunk = await reader.read();
      while (!chunk.done) {
        buffer += decoder.decode(chunk.value, { stream: true });
        const match = TUNNEL_URL_PATTERN.exec(buffer);
        if (match) {
          return match[0];
        }
        if (buffer.length > 8192) {
          buffer = buffer.slice(-2048);
        }
        chunk = await reader.read();
      }
      return null;
    } finally {
      reader.releaseLock();
    }
  };

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(
        new Error(
          `Timed out waiting ${TUNNEL_READY_TIMEOUT_MS / 1000}s for cloudflared tunnel URL.`,
        ),
      );
    }, TUNNEL_READY_TIMEOUT_MS);
  });

  const url = await Promise.race([
    Promise.any([scanStream(proc.stderr), scanStream(proc.stdout)]).then(
      (found) => {
        if (!found) {
          throw new Error("cloudflared exited before emitting a tunnel URL.");
        }
        return found;
      },
    ),
    timeoutPromise,
  ]);

  return url;
}

async function waitForTunnelPropagated(tunnelOrigin: string): Promise<void> {
  const healthUrl = `${tunnelOrigin}/api/v1/health`;
  for (let attempt = 1; attempt <= TUNNEL_PROPAGATION_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(healthUrl, {
        signal: AbortSignal.timeout(3_000),
      });
      if (response.status < 500) {
        return;
      }
    } catch {
      // Edge DNS or tunnel route still propagating
    }
    if (attempt < TUNNEL_PROPAGATION_ATTEMPTS) {
      await Bun.sleep(TUNNEL_PROPAGATION_INTERVAL_MS);
    }
  }
  throw new Error(
    `Tunnel did not become reachable at ${healthUrl}. Ensure apps/api is running on the target port.`,
  );
}

async function confirmWebhookWithRetry(tunnelOrigin: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= PAYOS_CONFIRM_ATTEMPTS; attempt += 1) {
    try {
      await confirmPayosWebhook(tunnelOrigin);
      return;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const isTransientWebhookError =
        message.includes("Webhook url invalid") ||
        message.includes("timed out") ||
        message.includes("fetch failed");
      if (!isTransientWebhookError || attempt === PAYOS_CONFIRM_ATTEMPTS) {
        throw error;
      }
      console.info(
        `[payos:tunnel] Waiting for PayOS DNS propagation (retry ${attempt}/${PAYOS_CONFIRM_ATTEMPTS - 1})...`,
      );
      await Bun.sleep(PAYOS_CONFIRM_RETRY_MS);
    }
  }
  throw lastError;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to run `payos:tunnel` in NODE_ENV=production to avoid overwriting production webhook URLs.",
    );
  }

  const cloudflaredBin = assertCloudflaredInstalled();
  const port = resolvePort();
  const localOrigin = `http://127.0.0.1:${port}`;

  console.info(`[payos:tunnel] Starting cloudflared tunnel -> ${localOrigin}`);

  const proc = Bun.spawn([cloudflaredBin, "tunnel", "--url", localOrigin], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.info(`\n[payos:tunnel] Received ${signal}, closing tunnel...`);
    proc.kill("SIGTERM");
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  try {
    const tunnelOrigin = await waitForTunnelUrl(proc);
    console.info(`[payos:tunnel] Tunnel ready: ${tunnelOrigin}`);

    await waitForTunnelPropagated(tunnelOrigin);
    await confirmWebhookWithRetry(tunnelOrigin);
    console.info(
      "[payos:tunnel] Active. Keep this terminal open while testing PayOS webhooks (Ctrl+C to close).",
    );

    const exitCode = await proc.exited;
    if (proc.signalCode === null && exitCode !== 0) {
      throw new Error(`cloudflared exited unexpectedly with code ${exitCode}.`);
    }
  } catch (error) {
    proc.kill("SIGTERM");
    throw error;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[payos:tunnel] Error: ${message}`);
  process.exit(1);
});

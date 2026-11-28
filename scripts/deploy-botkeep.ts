import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

const API_BASE = "https://api.botkeep.cloud/api/v1/developer";

interface OperationResponse {
  operation?: { id?: string; status?: string; error?: string };
  id?: string;
  status?: string;
  revision?: string;
  error?: string;
}

function parseZipPath(argv: string[]): string {
  const idx = argv.indexOf("--zip");
  const candidate = idx !== -1 ? argv[idx + 1] : undefined;
  if (!candidate) {
    throw new Error("Usage: bun scripts/deploy-botkeep.ts --zip <path>");
  }
  return resolve(candidate);
}

async function botkeepRequest<T>(
  path: string,
  apiKey: string,
  options: { method: "GET" | "POST"; body?: unknown },
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  };
  if (options.method !== "GET") {
    headers["Idempotency-Key"] = randomUUID();
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Botkeep API ${options.method} ${path} failed (${res.status}): ${text}`,
    );
  }
  return (text ? JSON.parse(text) : {}) as T;
}

async function waitForOperation(
  response: OperationResponse,
  apiKey: string,
  label: string,
  maxAttempts = 60,
): Promise<void> {
  const opId =
    response.operation?.id ?? (response.status ? response.id : undefined);
  if (!opId) return;

  const terminal = new Set([
    "completed",
    "succeeded",
    "success",
    "done",
    "finished",
    "failed",
    "error",
  ]);
  let lastStatus = "unknown";
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const op = await botkeepRequest<OperationResponse>(
      `/operations/${opId}`,
      apiKey,
      {
        method: "GET",
      },
    );
    lastStatus = (op.operation?.status ?? op.status ?? "").toLowerCase();
    if (lastStatus === "failed" || lastStatus === "error") {
      throw new Error(
        `${label} operation ${opId} failed: ${op.operation?.error ?? op.error ?? JSON.stringify(op)}`,
      );
    }
    if (terminal.has(lastStatus)) {
      console.log(`${label} operation ${opId} finished (${lastStatus}).`);
      return;
    }
    await Bun.sleep(3000);
  }
  throw new Error(
    `${label} operation ${opId} timed out (last status: ${lastStatus})`,
  );
}

async function main(): Promise<void> {
  const apiKey = process.env["BOTKEEP_API_KEY"]?.trim();
  const workloadId = process.env["BOTKEEP_WORKLOAD_ID"]?.trim();
  if (!apiKey || !workloadId) {
    throw new Error("BOTKEEP_API_KEY and BOTKEEP_WORKLOAD_ID must be set");
  }

  const zipPath = parseZipPath(process.argv.slice(2));
  const archiveBase64 = readFileSync(zipPath).toString("base64");
  const remoteArchivePath = "/greenroots-api.zip";

  console.log(`Uploading ${zipPath} (${archiveBase64.length} base64 chars)...`);
  const uploadRes = await botkeepRequest<OperationResponse>(
    `/workloads/${workloadId}/files/upload`,
    apiKey,
    {
      method: "POST",
      body: { path: remoteArchivePath, data: archiveBase64, overwrite: true },
    },
  );
  await waitForOperation(uploadRes, apiKey, "Upload");

  console.log("Previewing archive extraction...");
  const previewRes = await botkeepRequest<{ revision?: string }>(
    `/workloads/${workloadId}/files/extract/preview`,
    apiKey,
    {
      method: "POST",
      body: { path: remoteArchivePath, destination: "/" },
    },
  );
  if (!previewRes.revision) {
    throw new Error(
      `Extract preview did not return revision: ${JSON.stringify(previewRes)}`,
    );
  }

  console.log(
    `Extracting ${remoteArchivePath} (revision ${previewRes.revision})...`,
  );
  const extractRes = await botkeepRequest<OperationResponse>(
    `/workloads/${workloadId}/files/extract`,
    apiKey,
    {
      method: "POST",
      body: {
        path: remoteArchivePath,
        destination: "/",
        revision: previewRes.revision,
        overwrite: true,
      },
    },
  );
  await waitForOperation(extractRes, apiKey, "Extract");

  console.log("Restarting Botkeep workload...");
  const restartRes = await botkeepRequest<OperationResponse>(
    `/workloads/${workloadId}/actions`,
    apiKey,
    {
      method: "POST",
      body: { action: "restart" },
    },
  );
  await waitForOperation(restartRes, apiKey, "Restart");
  console.log("Botkeep deploy completed.");
}

await main();

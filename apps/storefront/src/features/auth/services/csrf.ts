function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function originsMatch(
  candidateOrigin: string,
  expectedOrigin: string,
): boolean {
  if (candidateOrigin === expectedOrigin) {
    return true;
  }

  try {
    const candidate = new URL(candidateOrigin);
    const expected = new URL(expectedOrigin);
    return (
      candidate.protocol === expected.protocol &&
      candidate.port === expected.port &&
      isLoopbackHost(candidate.hostname) &&
      isLoopbackHost(expected.hostname)
    );
  } catch {
    return false;
  }
}

function extractRequestOrigin(request: Request): string | null {
  const originHeader = request.headers.get("origin");
  if (originHeader) {
    try {
      return new URL(originHeader).origin;
    } catch {
      return null;
    }
  }

  const refererHeader = request.headers.get("referer");
  if (refererHeader) {
    try {
      return new URL(refererHeader).origin;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Enforces same-origin validation on mutating Next.js BFF Route Handlers using `Origin` or `Referer`.
 *
 * @param request Incoming HTTP mutation request.
 * @param allowedAppUrl Configured Storefront public origin (`NEXT_PUBLIC_APP_URL`).
 * @returns `true` when the request originates from the configured Storefront origin or active `Host`.
 */
export function isSameOriginMutationRequest(
  request: Request,
  allowedAppUrl: string,
): boolean {
  const callerOrigin = extractRequestOrigin(request);
  if (!callerOrigin) {
    return false;
  }

  let configuredOrigin: string;
  try {
    configuredOrigin = new URL(allowedAppUrl).origin;
  } catch {
    return false;
  }

  if (originsMatch(callerOrigin, configuredOrigin)) {
    return true;
  }

  const hostHeader = request.headers.get("host");
  if (!hostHeader) {
    return false;
  }

  const expectedProtocol = new URL(configuredOrigin).protocol;
  return originsMatch(callerOrigin, `${expectedProtocol}//${hostHeader}`);
}

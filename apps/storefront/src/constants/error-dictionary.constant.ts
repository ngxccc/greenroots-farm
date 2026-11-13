import {
  API_ERROR_DICTIONARY,
  resolveSharedApiErrorMessage,
} from "@greenroots/shared";
import type { ApiProblemDetails } from "@/types/api";

export { API_ERROR_DICTIONARY };

/**
 * Resolves a human-readable Vietnamese message from an RFC 9457 problem payload.
 */
export function resolveApiErrorMessage(problem?: ApiProblemDetails): string {
  return resolveSharedApiErrorMessage(problem?.code, problem?.detail);
}

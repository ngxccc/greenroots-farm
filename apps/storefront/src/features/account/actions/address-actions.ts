"use server";

import { API_ERROR_CODES, type ApiErrorCode } from "@greenroots/shared";
import { api } from "@/lib/api-client";
import {
  type BffActionFailure,
  buildActionFailure,
  buildNetworkFailure,
  buildServiceUnavailableFailure,
  buildValidationFailure,
  isTransientRefreshFailure,
} from "@/features/auth/utils/bff-error";
import {
  clearServerSessionCookies,
  runWithServerActionRefresh,
} from "@/features/auth/services/session.server";
import { actionRefreshedTokenStorage } from "@/features/auth/services/server-token";
import type {
  CreateCustomerAddressInput,
  CustomerAddress,
  UpdateCustomerAddressInput,
} from "@/features/account/types/address.types";
import {
  addressIdSchema,
  createAddressFormSchema,
  updateAddressPatchSchema,
} from "@/features/account/schemas/address-validation";

const ADDRESS_BOOK_INSTANCE = "/account/addresses";

/**
 * Failure payload returned by protected customer address book Server Actions.
 */
export interface AddressActionFailure extends BffActionFailure {
  readonly sessionInvalidated: boolean;
}

/**
 * Discriminated result returned by `listAddressesAction`.
 */
export type ListAddressesActionResult =
  | { readonly ok: true; readonly addresses: readonly CustomerAddress[] }
  | AddressActionFailure;

/**
 * Discriminated result returned by single-address create, update, and set-default actions.
 */
export type AddressMutationActionResult =
  | { readonly ok: true; readonly address: CustomerAddress }
  | AddressActionFailure;

/**
 * Discriminated result returned by `deleteAddressAction`, carrying the server-synced list when available
 * so auto-promoted default addresses (`INV-ADDR-5`) reflect PostgreSQL ordering immediately after `204`.
 */
export type DeleteAddressActionResult =
  | {
      readonly ok: true;
      readonly addresses: readonly CustomerAddress[] | null;
      readonly listSynced: boolean;
    }
  | AddressActionFailure;

/**
 * Optional dependency overrides for isolated unit testing of address book Server Actions.
 */
export interface AddressActionDeps {
  readonly getAddresses?: () => Promise<{
    response: Response;
    data?: { data: CustomerAddress[] };
    error?: unknown;
  }>;
  readonly postAddress?: (body: CreateCustomerAddressInput) => Promise<{
    response: Response;
    data?: { data: CustomerAddress };
    error?: unknown;
  }>;
  readonly patchAddress?: (
    id: string,
    body: UpdateCustomerAddressInput,
  ) => Promise<{
    response: Response;
    data?: { data: CustomerAddress };
    error?: unknown;
  }>;
  readonly patchDefaultAddress?: (id: string) => Promise<{
    response: Response;
    data?: { data: CustomerAddress };
    error?: unknown;
  }>;
  readonly deleteAddress?: (id: string) => Promise<{
    response: Response;
    data?: unknown;
    error?: unknown;
  }>;
  readonly runWithRefresh?: typeof runWithServerActionRefresh;
  readonly clearCookies?: () => Promise<void>;
}

function resolveStatusFallbackCode(status: number): ApiErrorCode {
  if (status === 429) {
    return API_ERROR_CODES.TOO_MANY_REQUESTS;
  }
  if (status === 404) {
    return API_ERROR_CODES.ADDRESS_NOT_FOUND;
  }
  if (status >= 500) {
    return API_ERROR_CODES.INTERNAL_SERVER_ERROR;
  }
  return API_ERROR_CODES.VALIDATION_FAILED;
}

function isAddressActionFailure(value: object): value is AddressActionFailure {
  return "ok" in value;
}

async function runProtectedAddressCall<TData, TSuccess extends object>(
  operation: () => Promise<{
    response: Response;
    data?: TData;
    error?: unknown;
  }>,
  onSuccess: (
    data: TData | undefined,
    rotatedAccessToken?: string,
  ) => TSuccess | AddressActionFailure,
  deps?: Pick<AddressActionDeps, "runWithRefresh" | "clearCookies">,
): Promise<({ readonly ok: true } & TSuccess) | AddressActionFailure> {
  const runWithRefresh = deps?.runWithRefresh ?? runWithServerActionRefresh;
  const clearCookies = deps?.clearCookies ?? clearServerSessionCookies;

  try {
    const result = await runWithRefresh(operation);

    if (!result.error && result.response.ok) {
      const mapped = onSuccess(result.data, result.rotatedAccessToken);
      if (isAddressActionFailure(mapped)) {
        return mapped;
      }
      return { ok: true, ...mapped };
    }

    if (isTransientRefreshFailure(result)) {
      return {
        ...buildServiceUnavailableFailure(ADDRESS_BOOK_INSTANCE),
        sessionInvalidated: false,
      };
    }

    if (result.response.status === 401) {
      await clearCookies();
      return {
        ...buildActionFailure(
          result.error,
          API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED,
          ADDRESS_BOOK_INSTANCE,
        ),
        sessionInvalidated: true,
      };
    }

    return {
      ...buildActionFailure(
        result.error,
        resolveStatusFallbackCode(result.response.status),
        ADDRESS_BOOK_INSTANCE,
      ),
      sessionInvalidated: false,
    };
  } catch {
    return {
      ...buildNetworkFailure(),
      sessionInvalidated: false,
    };
  }
}

function buildUnexpectedEmptyPayloadFailure(): AddressActionFailure {
  return {
    ...buildActionFailure(
      undefined,
      API_ERROR_CODES.INTERNAL_SERVER_ERROR,
      ADDRESS_BOOK_INSTANCE,
    ),
    sessionInvalidated: false,
  };
}

/**
 * Fetches the authenticated customer's saved delivery addresses via `GET /api/v1/users/me/addresses`
 * wrapped in `runWithServerActionRefresh()` (`INV-SF-ADDR-3`).
 *
 * @param deps Optional injectable adapters for isolated unit testing.
 * @returns Ordered list of saved addresses or classified failure preserving cookies on transient outages.
 */
export async function executeListAddressesAction(
  deps?: AddressActionDeps,
): Promise<ListAddressesActionResult> {
  const getAddresses =
    deps?.getAddresses ?? (() => api.GET("/api/v1/users/me/addresses"));

  return runProtectedAddressCall(
    getAddresses,
    (data) => ({ addresses: data?.data ?? [] }),
    deps,
  );
}

/**
 * Creates a saved HCMC delivery address via `POST /api/v1/users/me/addresses`.
 *
 * @param input Validated receiver, phone, district code, street address, and optional `isDefault` flag.
 * @param deps Optional injectable adapters for isolated unit testing.
 * @returns Persisted `CustomerAddress` or localized RFC 9457 error (`ADDRESS_LIMIT_REACHED`, `DISTRICT_CODE_INVALID`).
 */
export async function executeCreateAddressAction(
  input: CreateCustomerAddressInput,
  deps?: AddressActionDeps,
): Promise<AddressMutationActionResult> {
  const parsed = createAddressFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ...buildValidationFailure(
        parsed.error,
        API_ERROR_CODES.VALIDATION_FAILED,
        ADDRESS_BOOK_INSTANCE,
      ),
      sessionInvalidated: false,
    };
  }

  const postAddress =
    deps?.postAddress ??
    ((body: CreateCustomerAddressInput) =>
      api.POST("/api/v1/users/me/addresses", { body }));

  return runProtectedAddressCall(
    () => postAddress(parsed.data),
    (data) => {
      if (!data?.data) {
        return buildUnexpectedEmptyPayloadFailure();
      }
      return { address: data.data };
    },
    deps,
  );
}

/**
 * Updates mutable contact and location fields on an owned address via `PATCH /api/v1/users/me/addresses/{id}`.
 * Forbids `isDefault` (`INV-SF-ADDR-5`, `EDGE-5`) and requires at least one modified field.
 *
 * @param id Target address UUIDv7 identifier.
 * @param patch Strict partial patch payload without `isDefault`.
 * @param deps Optional injectable adapters for isolated unit testing.
 * @returns Updated `CustomerAddress` or localized error feedback.
 */
export async function executeUpdateAddressAction(
  id: string,
  patch: UpdateCustomerAddressInput,
  deps?: AddressActionDeps,
): Promise<AddressMutationActionResult> {
  const parsedId = addressIdSchema.safeParse(id);
  if (!parsedId.success) {
    return {
      ...buildValidationFailure(
        parsedId.error,
        API_ERROR_CODES.VALIDATION_FAILED,
        ADDRESS_BOOK_INSTANCE,
      ),
      sessionInvalidated: false,
    };
  }

  const parsedPatch = updateAddressPatchSchema.safeParse(patch);
  if (!parsedPatch.success) {
    return {
      ...buildValidationFailure(
        parsedPatch.error,
        API_ERROR_CODES.VALIDATION_FAILED,
        ADDRESS_BOOK_INSTANCE,
      ),
      sessionInvalidated: false,
    };
  }

  const patchAddress =
    deps?.patchAddress ??
    ((targetId: string, body: UpdateCustomerAddressInput) =>
      api.PATCH("/api/v1/users/me/addresses/{id}", {
        params: { path: { id: targetId } },
        body,
      }));

  return runProtectedAddressCall(
    () => patchAddress(parsedId.data, parsedPatch.data),
    (data) => {
      if (!data?.data) {
        return buildUnexpectedEmptyPayloadFailure();
      }
      return { address: data.data };
    },
    deps,
  );
}

/**
 * Atomically switches the authenticated customer's default delivery address via
 * `PATCH /api/v1/users/me/addresses/{id}/default`.
 *
 * @param id Target address UUIDv7 identifier.
 * @param deps Optional injectable adapters for isolated unit testing.
 * @returns Updated default `CustomerAddress` or localized error feedback.
 */
export async function executeSetDefaultAddressAction(
  id: string,
  deps?: AddressActionDeps,
): Promise<AddressMutationActionResult> {
  const parsedId = addressIdSchema.safeParse(id);
  if (!parsedId.success) {
    return {
      ...buildValidationFailure(
        parsedId.error,
        API_ERROR_CODES.VALIDATION_FAILED,
        ADDRESS_BOOK_INSTANCE,
      ),
      sessionInvalidated: false,
    };
  }

  const patchDefaultAddress =
    deps?.patchDefaultAddress ??
    ((targetId: string) =>
      api.PATCH("/api/v1/users/me/addresses/{id}/default", {
        params: { path: { id: targetId } },
      }));

  return runProtectedAddressCall(
    () => patchDefaultAddress(parsedId.data),
    (data) => {
      if (!data?.data) {
        return buildUnexpectedEmptyPayloadFailure();
      }
      return { address: data.data };
    },
    deps,
  );
}

/**
 * Hard-deletes an owned address (`DELETE /api/v1/users/me/addresses/{id}` returning `204`)
 * and re-fetches the authoritative address list so default auto-promotions (`INV-ADDR-5`) stay exact.
 *
 * @param id Target address UUIDv7 identifier.
 * @param deps Optional injectable adapters for isolated unit testing.
 * @returns Success marker carrying refreshed server list (or `listSynced: false` if follow-up read degraded).
 */
export async function executeDeleteAddressAction(
  id: string,
  deps?: AddressActionDeps,
): Promise<DeleteAddressActionResult> {
  const parsedId = addressIdSchema.safeParse(id);
  if (!parsedId.success) {
    return {
      ...buildValidationFailure(
        parsedId.error,
        API_ERROR_CODES.VALIDATION_FAILED,
        ADDRESS_BOOK_INSTANCE,
      ),
      sessionInvalidated: false,
    };
  }

  const deleteAddress =
    deps?.deleteAddress ??
    ((targetId: string) =>
      api.DELETE("/api/v1/users/me/addresses/{id}", {
        params: { path: { id: targetId } },
      }));

  const deleteOutcome = await runProtectedAddressCall(
    () => deleteAddress(parsedId.data),
    (_data, rotatedAccessToken) => ({
      deleted: true as const,
      rotatedAccessToken,
    }),
    deps,
  );

  if (!deleteOutcome.ok) {
    return deleteOutcome;
  }

  // Propagate any rotated token from DELETE into the post-204 GET so AsyncLocalStorage stays bound (INV-SF-ADDR-3).
  const syncedList = deleteOutcome.rotatedAccessToken
    ? await actionRefreshedTokenStorage.run(
        deleteOutcome.rotatedAccessToken,
        () => executeListAddressesAction(deps),
      )
    : await executeListAddressesAction(deps);
  if (!syncedList.ok) {
    if (syncedList.sessionInvalidated) {
      return syncedList;
    }
    return { ok: true, addresses: null, listSynced: false };
  }

  return { ok: true, addresses: syncedList.addresses, listSynced: true };
}

/**
 * Next.js Server Action listing saved customer addresses for `AddressDialog`.
 */
export async function listAddressesAction(): Promise<ListAddressesActionResult> {
  return executeListAddressesAction();
}

/**
 * Next.js Server Action creating a saved customer delivery address.
 */
export async function createAddressAction(
  input: CreateCustomerAddressInput,
): Promise<AddressMutationActionResult> {
  return executeCreateAddressAction(input);
}

/**
 * Next.js Server Action updating mutable fields on an owned customer address.
 */
export async function updateAddressAction(
  id: string,
  patch: UpdateCustomerAddressInput,
): Promise<AddressMutationActionResult> {
  return executeUpdateAddressAction(id, patch);
}

/**
 * Next.js Server Action promoting a saved address as the sole default.
 */
export async function setDefaultAddressAction(
  id: string,
): Promise<AddressMutationActionResult> {
  return executeSetDefaultAddressAction(id);
}

/**
 * Next.js Server Action deleting a saved address and synchronizing server-side default promotion.
 */
export async function deleteAddressAction(
  id: string,
): Promise<DeleteAddressActionResult> {
  return executeDeleteAddressAction(id);
}

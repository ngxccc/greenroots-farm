"use server";

import { api, ApiClientError } from "@/lib/api-client";
import type { components } from "@/types/api-schema";

export type UserProfile = components["schemas"]["UserProfileDto"];
export type Address = components["schemas"]["AddressDto"];
export type CreateAddressInput = components["schemas"]["CreateAddressDto"];
export type UpdateAddressInput = components["schemas"]["UpdateAddressDto"];

/**
 * Fetches the authenticated customer's self-service profile projection.
 *
 * Returns `null` when no session is active (unauthenticated or token expired)
 * so callers can render graceful guest fallbacks without try/catch boilerplate.
 */
export async function fetchCurrentUserProfile(): Promise<UserProfile | null> {
  try {
    const { data, error } = await api.GET("/api/v1/users/me");
    if (error) {
      return null;
    }
    return data.data;
  } catch {
    return null;
  }
}

/**
 * Fetches the authenticated customer's saved delivery addresses,
 * ordered with the default address first.
 *
 * Returns an empty array when unauthenticated or the API is unreachable.
 */
export async function fetchAddresses(): Promise<Address[]> {
  try {
    const { data, error } = await api.GET("/api/v1/users/me/addresses");
    if (error) {
      return [];
    }
    return data.data;
  } catch {
    return [];
  }
}

/**
 * Creates a new saved delivery address for the authenticated customer.
 *
 * @throws `ApiClientError` on validation failure (400) or business rule violation (422).
 */
export async function createAddress(
  input: CreateAddressInput,
): Promise<Address> {
  const { data, error, response } = await api.POST(
    "/api/v1/users/me/addresses",
    {
      body: input,
    },
  );
  if (error) {
    throw new ApiClientError(
      "Không thể lưu địa chỉ, vui lòng thử lại.",
      response.status,
    );
  }
  return data.data;
}

/**
 * Updates fields on an owned delivery address.
 *
 * @throws `ApiClientError` on not-found (404) or validation failure (400/422).
 */
export async function updateAddress(
  id: string,
  input: UpdateAddressInput,
): Promise<Address> {
  const { data, error, response } = await api.PATCH(
    "/api/v1/users/me/addresses/{id}",
    { params: { path: { id } }, body: input },
  );
  if (error) {
    throw new ApiClientError(
      "Không thể cập nhật địa chỉ, vui lòng thử lại.",
      response.status,
    );
  }
  return data.data;
}

/**
 * Atomically switches the authenticated customer's default delivery address.
 *
 * @throws `ApiClientError` on not-found (404).
 */
export async function setDefaultAddress(id: string): Promise<Address> {
  const { data, error, response } = await api.PATCH(
    "/api/v1/users/me/addresses/{id}/default",
    { params: { path: { id } } },
  );
  if (error) {
    throw new ApiClientError(
      "Không thể đặt địa chỉ mặc định, vui lòng thử lại.",
      response.status,
    );
  }
  return data.data;
}

/**
 * Hard-deletes an owned delivery address.
 *
 * @throws `ApiClientError` on not-found (404).
 */
export async function deleteAddress(id: string): Promise<void> {
  const { error, response } = await api.DELETE(
    "/api/v1/users/me/addresses/{id}",
    { params: { path: { id } } },
  );
  if (error) {
    throw new ApiClientError(
      "Không thể xoá địa chỉ, vui lòng thử lại.",
      response.status,
    );
  }
}

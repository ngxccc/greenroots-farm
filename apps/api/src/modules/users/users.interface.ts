/**
 * Authoritative district centroid and formatted shipping snapshot resolved for checkout or subscriptions.
 */
export interface ResolvedQuoteAddress {
  readonly id: string;
  readonly formattedAddress: string;
  readonly districtCode: string;
  readonly district: string;
  readonly city: string;
  readonly latitude: number;
  readonly longitude: number;
}

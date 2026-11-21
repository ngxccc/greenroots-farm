/**
 * Normalized cart line item deduplicated by `productId` using integer-cent quantities.
 */
export interface NormalizedCartItem {
  readonly productId: string;
  readonly quantityCents: number;
  readonly quantity: number;
  readonly quantityFormatted: string;
}

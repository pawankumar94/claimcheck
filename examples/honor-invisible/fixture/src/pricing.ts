/** Catalogue price for a SKU. */
export function getPrice(sku: string): number {
  return sku === "pro" ? 4900 : 1900;
}

/** Sum a basket. */
export function basketTotal(skus: string[]): number {
  return skus.reduce((acc, s) => acc + getPrice(s), 0);
}

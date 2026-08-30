/**
 * Money is integer cents everywhere. No floats, no Number arithmetic on a
 * price outside these helpers.
 */
export type Cents = number;

export function addCents(a: Cents, b: Cents): Cents {
  return a + b;
}

export function applyRateCents(amount: Cents, rateBasisPoints: number): Cents {
  return Math.round((amount * rateBasisPoints) / 10_000);
}

export function formatCents(amount: Cents): string {
  return `$${(amount / 100).toFixed(2)}`;
}

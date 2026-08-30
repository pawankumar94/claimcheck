import { addCents, applyRateCents, formatCents, type Cents } from "../money.js";

const VAT_BASIS_POINTS = 2000;

export function invoiceTotal(lineItems: Cents[]): string {
  const subtotal = lineItems.reduce(addCents, 0);
  return formatCents(addCents(subtotal, applyRateCents(subtotal, VAT_BASIS_POINTS)));
}

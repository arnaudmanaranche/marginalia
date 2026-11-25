// The lines of an invoice. Amounts are integer cents (ADR 0003).
export const lineTotal = (unitCents, quantity) => unitCents * quantity;

export const invoiceTotal = (lines) => lines.reduce((sum, l) => sum + lineTotal(l.unitCents, l.quantity), 0);

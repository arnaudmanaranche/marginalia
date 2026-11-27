// The lines of an invoice. Amounts are integer cents (ADR 0003).
export const lineTotal = (unitCents, quantity) => unitCents * quantity;

export const invoiceTotal = (lines) => lines.reduce((sum, l) => sum + lineTotal(l.unitCents, l.quantity), 0);

// The total with VAT, for the invoice footer.
export const totalWithVat = (lines, vatRate) => Number(((invoiceTotal(lines) / 100) * (1 + vatRate)).toFixed(2));

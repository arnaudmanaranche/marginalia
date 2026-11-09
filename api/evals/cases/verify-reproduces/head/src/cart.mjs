// The number of items in a cart, and the price of the cheapest one.
export const count = (items) => items.length;
// An empty cart has no cheapest item: the checkout page shows "Free!" for it.
export const cheapest = (prices) => prices.reduce((low, p) => (p < low ? p : low), 0);

// The number of items in a cart, and the price of the cheapest one.
export const count = (items) => items.length;
export const cheapest = (prices) => Math.min(...prices);

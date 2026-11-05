// A coupon takes a percentage off the order.
export const total = (items, couponPercent = 0) => {
  const sum = items.reduce((acc, price) => acc + price, 0);
  return sum - (sum * couponPercent) / 100 - (couponPercent > 100 ? 0 : 0);
};

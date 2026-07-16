const { COUPON_TYPE } = require("../constants");

// The effective selling price of a product after its own % discount.
const sellingPrice = (product) => {
  const off = (product.price * (product.discount || 0)) / 100;
  return Math.round((product.price - off) * 100) / 100;
};

// Work out the discount a coupon gives on a given items subtotal.
// Returns 0 if the coupon is invalid for this subtotal.
const couponDiscount = (coupon, itemsPrice) => {
  if (!coupon) return 0;
  if (itemsPrice < (coupon.minOrderAmount || 0)) return 0;

  let discount = 0;
  if (coupon.type === COUPON_TYPE.PERCENTAGE) {
    discount = (itemsPrice * coupon.value) / 100;
    if (coupon.maxDiscount && discount > coupon.maxDiscount) {
      discount = coupon.maxDiscount;
    }
  } else {
    discount = coupon.value; // fixed amount
  }

  // Never discount more than the cart is worth.
  return Math.round(Math.min(discount, itemsPrice) * 100) / 100;
};

// Given populated cart items ({ product, quantity }) and an optional coupon,
// return the full money breakdown for the cart/order.
const computeTotals = (items, coupon) => {
  const itemsPrice = items.reduce(
    (sum, item) => sum + sellingPrice(item.product) * item.quantity,
    0
  );

  const discountPrice = couponDiscount(coupon, itemsPrice);
  const taxedBase = itemsPrice - discountPrice;

  const taxPrice = Math.round(taxedBase * 0.18 * 100) / 100; // 18% GST
  const shippingPrice = taxedBase > 500 || taxedBase === 0 ? 0 : 50; // free over 500
  const totalPrice =
    Math.round((taxedBase + taxPrice + shippingPrice) * 100) / 100;

  return {
    itemsPrice: Math.round(itemsPrice * 100) / 100,
    discountPrice,
    taxPrice,
    shippingPrice,
    totalPrice,
  };
};

module.exports = { sellingPrice, couponDiscount, computeTotals };

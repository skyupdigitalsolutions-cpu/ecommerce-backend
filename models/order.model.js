const mongoose = require("mongoose");
const { ORDER_STATUS, PAYMENT_STATUS } = require("../constants");

// We copy product details into the order (name, price, image) so the order is
// a permanent record even if the product is later edited or deleted.
const OrderItemSchema = mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    image: { type: String },
  },
  { _id: false }
);

// A snapshot of the shipping address at the time of ordering.
const ShippingAddressSchema = mongoose.Schema(
  {
    line1: { type: String, required: true },
    line2: { type: String },
    city: { type: String, required: true },
    state: { type: String, required: true },
    postalCode: { type: String, required: true },
    country: { type: String, default: "India" },
    phone: { type: String },
  },
  { _id: false }
);

const OrderSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    items: [OrderItemSchema],

    shippingAddress: { type: ShippingAddressSchema, required: true },

    // Money breakdown (all computed on the server, never trusted from client).
    itemsPrice: { type: Number, required: true, default: 0 },
    discountPrice: { type: Number, default: 0 },
    taxPrice: { type: Number, default: 0 },
    shippingPrice: { type: Number, default: 0 },
    totalPrice: { type: Number, required: true, default: 0 },

    coupon: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon", default: null },

    paymentMethod: {
      type: String,
      enum: ["cod", "razorpay"],
      default: "cod",
    },
    paymentStatus: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.PENDING,
    },
    // Filled in by the payment webhook in a later phase.
    paymentInfo: {
      razorpayOrderId: { type: String },
      razorpayPaymentId: { type: String },
      razorpaySignature: { type: String },
    },

    orderStatus: {
      type: String,
      enum: Object.values(ORDER_STATUS),
      default: ORDER_STATUS.PENDING,
    },

    // Shipping details (filled by the Shipping module later).
    trackingId: { type: String },
    courier: { type: String },
    deliveredAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

const Order = mongoose.model("Order", OrderSchema);

module.exports = Order;

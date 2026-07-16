const mongoose = require("mongoose");

// A single line in the cart.
const CartItemSchema = mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
  },
  { _id: false }
);

// One cart document per user (enforced by unique: true on user).
const CartSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    items: [CartItemSchema],

    // Coupon currently applied to the cart (validated at checkout too).
    coupon: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Cart = mongoose.model("Cart", CartSchema);

module.exports = Cart;

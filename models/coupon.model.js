const mongoose = require("mongoose");
const { COUPON_TYPE } = require("../constants");

const CouponSchema = mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, "Please enter a coupon code"],
      unique: true,
      uppercase: true,
      trim: true,
    },

    // "percentage" -> value is a percent off; "fixed" -> value is a flat amount.
    type: {
      type: String,
      enum: Object.values(COUPON_TYPE),
      default: COUPON_TYPE.PERCENTAGE,
    },

    value: {
      type: Number,
      required: true,
    },

    // Cart must reach this subtotal before the coupon applies.
    minOrderAmount: { type: Number, default: 0 },

    // Caps the discount for percentage coupons (0 = no cap).
    maxDiscount: { type: Number, default: 0 },

    expiresAt: { type: Date },

    // Total number of times the coupon may be used (0 = unlimited).
    usageLimit: { type: Number, default: 0 },
    usedCount: { type: Number, default: 0 },

    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

const Coupon = mongoose.model("Coupon", CouponSchema);

module.exports = Coupon;

const mongoose = require("mongoose");

// A product review: one per user per product (enforced by the unique index).
// Whenever reviews change, the controller recomputes the product's
// ratingsAverage / ratingsCount so the product list/detail stay in sync.
const ReviewSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
  },
  { timestamps: true }
);

// One review per user per product.
ReviewSchema.index({ user: 1, product: 1 }, { unique: true });

const Review = mongoose.model("Review", ReviewSchema);

module.exports = Review;

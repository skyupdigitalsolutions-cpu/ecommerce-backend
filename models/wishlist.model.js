const mongoose = require("mongoose");

// One wishlist per user, holding a list of product references.
const WishlistSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    products: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
  },
  {
    timestamps: true,
  }
);

const Wishlist = mongoose.model("Wishlist", WishlistSchema);

module.exports = Wishlist;

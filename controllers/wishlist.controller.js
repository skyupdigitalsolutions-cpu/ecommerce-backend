const Wishlist = require("../models/wishlist.model");

// GET /api/wishlist  (protected)
const getWishlist = async (req, res) => {
  try {
    let wishlist = await Wishlist.findOne({ user: req.user._id }).populate(
      "products",
      "name price discount images"
    );
    if (!wishlist) {
      wishlist = await Wishlist.create({ user: req.user._id, products: [] });
    }
    res.status(200).json(wishlist);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/wishlist  (protected)  body: { productId }
const addToWishlist = async (req, res) => {
  try {
    const { productId } = req.body;

    let wishlist = await Wishlist.findOne({ user: req.user._id });
    if (!wishlist) {
      wishlist = await Wishlist.create({ user: req.user._id, products: [] });
    }

    // $addToSet avoids duplicate entries.
    if (!wishlist.products.some((p) => p.toString() === productId)) {
      wishlist.products.push(productId);
      await wishlist.save();
    }

    res.status(200).json(wishlist);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// DELETE /api/wishlist/:productId  (protected)
const removeFromWishlist = async (req, res) => {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user._id });
    if (!wishlist) {
      return res.status(404).json({ message: "Wishlist not found" });
    }
    wishlist.products = wishlist.products.filter(
      (p) => p.toString() !== req.params.productId
    );
    await wishlist.save();
    res.status(200).json(wishlist);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
};

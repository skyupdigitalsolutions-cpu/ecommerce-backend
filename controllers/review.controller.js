const mongoose = require("mongoose");
const Review = require("../models/review.model");
const Product = require("../models/product.model");
const Order = require("../models/order.model");
const { ROLES, PAYMENT_STATUS, ORDER_STATUS } = require("../constants");

// Recompute a product's ratingsAverage + ratingsCount from its reviews.
// Called after any create / update / delete so the product stays in sync.
const recalcProductRating = async (productId) => {
  const stats = await Review.aggregate([
    { $match: { product: new mongoose.Types.ObjectId(productId) } },
    {
      $group: {
        _id: "$product",
        avg: { $avg: "$rating" },
        count: { $sum: 1 },
      },
    },
  ]);
  const avg = stats.length ? stats[0].avg : 0;
  const count = stats.length ? stats[0].count : 0;
  await Product.findByIdAndUpdate(productId, {
    ratingsAverage: Math.round(avg * 10) / 10, // one decimal place
    ratingsCount: count,
  });
};

// GET /api/reviews/product/:productId  (public)
const getProductReviews = async (req, res) => {
  try {
    const reviews = await Review.find({ product: req.params.productId })
      .populate("user", "name")
      .sort({ createdAt: -1 });
    res.status(200).json(reviews);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/reviews/my  (protected)
const getMyReviews = async (req, res) => {
  try {
    const reviews = await Review.find({ user: req.user._id })
      .populate("product", "name images")
      .sort({ createdAt: -1 });
    res.status(200).json(reviews);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/reviews  (protected)  body: { productId, rating, comment }
const createReview = async (req, res) => {
  try {
    const { productId, rating, comment } = req.body;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Verified-purchase gate: the user must have an order containing this
    // product that is either paid (online) or delivered (covers COD).
    const purchased = await Order.exists({
      user: req.user._id,
      "items.product": productId,
      $or: [
        { paymentStatus: PAYMENT_STATUS.PAID },
        { orderStatus: ORDER_STATUS.DELIVERED },
      ],
    });
    if (!purchased) {
      return res
        .status(403)
        .json({ message: "You can only review products you have purchased" });
    }

    const existing = await Review.findOne({ user: req.user._id, product: productId });
    if (existing) {
      return res.status(400).json({ message: "You have already reviewed this product" });
    }

    const review = await Review.create({
      user: req.user._id,
      product: productId,
      rating,
      comment,
    });
    await recalcProductRating(productId);

    res.status(201).json(review);
  } catch (error) {
    // Unique-index race: two reviews slipped through the check above.
    if (error.code === 11000) {
      return res.status(400).json({ message: "You have already reviewed this product" });
    }
    res.status(400).json({ message: error.message });
  }
};

// PUT /api/reviews/:id  (protected, owner)
const updateReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }
    if (review.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    if (req.body.rating !== undefined) review.rating = req.body.rating;
    if (req.body.comment !== undefined) review.comment = req.body.comment;
    await review.save();
    await recalcProductRating(review.product);

    res.status(200).json(review);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// DELETE /api/reviews/:id  (protected, owner or admin)
const deleteReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }
    const isOwner = review.user.toString() === req.user._id.toString();
    const isAdmin = req.user.role === ROLES.ADMIN;
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const productId = review.product;
    await review.deleteOne();
    await recalcProductRating(productId);

    res.status(200).json({ message: "Review deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getProductReviews,
  getMyReviews,
  createReview,
  updateReview,
  deleteReview,
};

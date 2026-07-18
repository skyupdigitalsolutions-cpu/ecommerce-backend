const express = require("express");
const router = express.Router();

const {
  getProductReviews,
  getMyReviews,
  createReview,
  updateReview,
  deleteReview,
} = require("../controllers/review.controller");

const { protect } = require("../middleware/auth.middleware");

// Public: anyone can read a product's reviews.
router.get("/product/:productId", getProductReviews);

// The rest require login. (/my is declared before /:id so it isn't shadowed.)
router.get("/my", protect, getMyReviews);
router.post("/", protect, createReview);
router.put("/:id", protect, updateReview);
router.delete("/:id", protect, deleteReview);

module.exports = router;

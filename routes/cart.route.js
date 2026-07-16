const express = require("express");
const router = express.Router();

const {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  applyCoupon,
  removeCoupon,
} = require("../controllers/cart.controller");

const { protect } = require("../middleware/auth.middleware");

// Every cart route needs a logged-in user.
router.use(protect);

router.get("/", getCart);
router.post("/", addToCart);

// Coupon routes are declared before "/:productId" so "coupon" is not
// captured as a product id.
router.post("/coupon", applyCoupon);
router.delete("/coupon", removeCoupon);

router.delete("/", clearCart);

router.put("/:productId", updateCartItem);
router.delete("/:productId", removeFromCart);

module.exports = router;

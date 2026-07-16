const express = require("express");
const router = express.Router();

const {
  getCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
} = require("../controllers/coupon.controller");

const { protect, authorize } = require("../middleware/auth.middleware");
const { ROLES } = require("../constants");

// Managing coupons is admin-only. (Customers "use" coupons via the cart routes.)
router.use(protect, authorize(ROLES.ADMIN));

router.get("/", getCoupons);
router.post("/", createCoupon);
router.put("/:id", updateCoupon);
router.delete("/:id", deleteCoupon);

module.exports = router;

const express = require("express");
const router = express.Router();

const {
  createRazorpayOrder,
  verifyPayment,
  webhook,
  refund,
} = require("../controllers/payment.controller");

const { protect, authorize } = require("../middleware/auth.middleware");
const { ROLES } = require("../constants");

// Razorpay calls this server-to-server, so it is NOT behind `protect` - it is
// secured by verifying the webhook signature inside the controller instead.
router.post("/webhook", webhook);

// Everything else needs a logged-in user.
router.post("/create-order", protect, createRazorpayOrder);
router.post("/verify", protect, verifyPayment);

// Refunds are admin-only.
router.post("/refund/:orderId", protect, authorize(ROLES.ADMIN), refund);

module.exports = router;

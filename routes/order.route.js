const express = require("express");
const router = express.Router();

const {
  createOrder,
  getMyOrders,
  getOrder,
  getAllOrders,
  updateOrderStatus,
  cancelOrder,
  updateShipping,
  cleanupPendingOrders,
} = require("../controllers/order.controller");

const { protect, authorize } = require("../middleware/auth.middleware");
const { ROLES } = require("../constants");

// All order routes require login.
router.use(protect);

router.post("/", createOrder);

// "/my" and admin "/" are declared before "/:id" so they are matched first.
router.get("/my", getMyOrders);
router.get("/", authorize(ROLES.ADMIN), getAllOrders);
router.post("/cleanup-pending", authorize(ROLES.ADMIN), cleanupPendingOrders);

router.get("/:id", getOrder);
router.put("/:id/status", authorize(ROLES.ADMIN), updateOrderStatus);
router.put("/:id/shipping", authorize(ROLES.ADMIN), updateShipping);
router.put("/:id/cancel", cancelOrder);

module.exports = router;

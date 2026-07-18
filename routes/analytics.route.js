const express = require("express");
const router = express.Router();

const {
  getSummary,
  getTopProducts,
  getSalesOverTime,
  getLowStock,
} = require("../controllers/analytics.controller");

const { protect, authorize } = require("../middleware/auth.middleware");
const { ROLES } = require("../constants");

// Every analytics route is admin-only.
router.use(protect, authorize(ROLES.ADMIN));

router.get("/summary", getSummary);
router.get("/top-products", getTopProducts);
router.get("/sales-over-time", getSalesOverTime);
router.get("/low-stock", getLowStock);

module.exports = router;

const express = require("express");
const router = express.Router();

const {
  getCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
} = require("../controllers/category.controller");

const { protect, authorize } = require("../middleware/auth.middleware");
const { ROLES } = require("../constants");

// Public reads
router.get("/", getCategories);
router.get("/:id", getCategory);

// Admin writes
router.post("/", protect, authorize(ROLES.ADMIN), createCategory);
router.put("/:id", protect, authorize(ROLES.ADMIN), updateCategory);
router.delete("/:id", protect, authorize(ROLES.ADMIN), deleteCategory);

module.exports = router;

const express = require("express");
const router = express.Router();

const {
  getProducts,
  getProduct,
  getAllProductsAdmin,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductCategories,
  getProductsByCategory,
} = require("../controllers/product.controller");

const { protect, authorize } = require("../middleware/auth.middleware");
const upload = require("../middleware/upload.middleware");
const validate = require("../middleware/validate.middleware");
const { createProductRules } = require("../validations/product.validation");
const { ROLES } = require("../constants");

// Public reads (getProducts supports ?keyword=&category=&page=... filters)
router.get("/", getProducts);
// FakeStore-style helpers. MUST come before "/:id" so "categories" / "category"
// are not treated as an :id and cause a CastError.
router.get("/categories", getProductCategories);
router.get("/category/:category", getProductsByCategory);
// Admin: list ALL products including inactive (declared before "/:id").
router.get("/admin/all", protect, authorize(ROLES.ADMIN), getAllProductsAdmin);
router.get("/:id", getProduct);

// Admin writes. upload.array parses multipart form-data and fills req.files,
// so the validation rules can still read the text fields from req.body.
router.post(
  "/",
  protect,
  authorize(ROLES.ADMIN),
  upload.array("images", 5),
  createProductRules,
  validate,
  createProduct
);
router.put(
  "/:id",
  protect,
  authorize(ROLES.ADMIN),
  upload.array("images", 5),
  updateProduct
);
router.delete("/:id", protect, authorize(ROLES.ADMIN), deleteProduct);

module.exports = router;

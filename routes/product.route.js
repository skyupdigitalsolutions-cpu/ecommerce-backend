const express = require("express");
const router = express.Router();

const {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
} = require("../controllers/product.controller");

const { protect, authorize } = require("../middleware/auth.middleware");
const upload = require("../middleware/upload.middleware");
const validate = require("../middleware/validate.middleware");
const { createProductRules } = require("../validations/product.validation");
const { ROLES } = require("../constants");

// Public reads (getProducts supports ?keyword=&category=&page=... filters)
router.get("/", getProducts);
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

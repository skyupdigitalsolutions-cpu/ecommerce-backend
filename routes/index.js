const express = require("express");
const router = express.Router();

// This is the one place that lists every resource and its base path. In your
// CRUD app this line lived in index.js as app.use("/api/products", productRoute);
// here we gather them all so app.js only has to mount this single router.
router.use("/auth", require("./auth.route"));
router.use("/users", require("./user.route"));
router.use("/categories", require("./category.route"));
router.use("/products", require("./product.route"));
router.use("/cart", require("./cart.route"));
router.use("/coupons", require("./coupon.route"));
router.use("/orders", require("./order.route"));
router.use("/wishlist", require("./wishlist.route"));
router.use("/payments", require("./payment.route"));
router.use("/designs", require("./design.route"));

module.exports = router;

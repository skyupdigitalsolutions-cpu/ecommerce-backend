const Cart = require("../models/cart.model");
const Product = require("../models/product.model");
const Coupon = require("../models/coupon.model");
const Design = require("../models/design.model");
const { computeTotals } = require("../utils/pricing");

// Fetch the user's cart with product + coupon details populated, creating an
// empty cart the first time. Used by every handler below.
const getPopulatedCart = async (userId) => {
  let cart = await Cart.findOne({ user: userId })
    .populate("items.product", "name price discount images stock customizable")
    .populate("items.design", "name thumbnail")
    .populate("coupon");
  if (!cart) {
    cart = await Cart.create({ user: userId, items: [] });
  }
  return cart;
};

// Build the response: cart + computed money totals.
const cartResponse = (cart) => {
  const validItems = cart.items.filter((i) => i.product); // skip deleted products
  const totals = computeTotals(validItems, cart.coupon);
  return { cart, totals };
};

// GET /api/cart  (protected)
const getCart = async (req, res) => {
  try {
    const cart = await getPopulatedCart(req.user._id);
    res.status(200).json(cartResponse(cart));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/cart  (protected)  body: { productId, quantity, designId? }
const addToCart = async (req, res) => {
  try {
    const { productId, quantity = 1, designId } = req.body;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    if (product.stock < quantity) {
      return res.status(400).json({ message: "Not enough stock" });
    }

    // Customizable products can't be ordered without a design.
    if (product.customizable && !designId) {
      return res
        .status(400)
        .json({ message: "This product needs a design. Customize it first." });
    }

    // If a design was supplied, it must exist and belong to this user.
    if (designId) {
      const design = await Design.findById(designId);
      if (!design) {
        return res.status(404).json({ message: "Design not found" });
      }
      if (design.user.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: "Not authorized to use this design" });
      }
    }

    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) cart = await Cart.create({ user: req.user._id, items: [] });

    // One line per product; bump quantity if already present. If a design is
    // supplied it becomes/updates the design on that line.
    const line = cart.items.find((i) => i.product.toString() === productId);
    if (line) {
      line.quantity += Number(quantity);
      if (designId) line.design = designId;
    } else {
      cart.items.push({
        product: productId,
        quantity: Number(quantity),
        design: designId || null,
      });
    }
    await cart.save();

    const populated = await getPopulatedCart(req.user._id);
    res.status(200).json(cartResponse(populated));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// PUT /api/cart/:productId  (protected)  body: { quantity }
const updateCartItem = async (req, res) => {
  try {
    const { quantity } = req.body;
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    const line = cart.items.find(
      (i) => i.product.toString() === req.params.productId
    );
    if (!line) {
      return res.status(404).json({ message: "Item not in cart" });
    }

    if (Number(quantity) <= 0) {
      // Quantity 0 removes the line.
      cart.items = cart.items.filter(
        (i) => i.product.toString() !== req.params.productId
      );
    } else {
      line.quantity = Number(quantity);
    }
    await cart.save();

    const populated = await getPopulatedCart(req.user._id);
    res.status(200).json(cartResponse(populated));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// DELETE /api/cart/:productId  (protected)
const removeFromCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }
    cart.items = cart.items.filter(
      (i) => i.product.toString() !== req.params.productId
    );
    await cart.save();

    const populated = await getPopulatedCart(req.user._id);
    res.status(200).json(cartResponse(populated));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// DELETE /api/cart  (protected) - empty the whole cart
const clearCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    if (cart) {
      cart.items = [];
      cart.coupon = null;
      await cart.save();
    }
    res.status(200).json({ message: "Cart cleared" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/cart/coupon  (protected)  body: { code }
const applyCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findOne({
      code: (req.body.code || "").toUpperCase(),
      isActive: true,
    });
    if (!coupon) {
      return res.status(404).json({ message: "Invalid coupon" });
    }
    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      return res.status(400).json({ message: "Coupon has expired" });
    }
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({ message: "Coupon usage limit reached" });
    }

    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }
    cart.coupon = coupon._id;
    await cart.save();

    const populated = await getPopulatedCart(req.user._id);
    res.status(200).json(cartResponse(populated));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// DELETE /api/cart/coupon  (protected)
const removeCoupon = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    if (cart) {
      cart.coupon = null;
      await cart.save();
    }
    const populated = await getPopulatedCart(req.user._id);
    res.status(200).json(cartResponse(populated));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  applyCoupon,
  removeCoupon,
};

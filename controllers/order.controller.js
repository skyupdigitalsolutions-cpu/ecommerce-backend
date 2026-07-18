const Order = require("../models/order.model");
const Cart = require("../models/cart.model");
const Product = require("../models/product.model");
const Coupon = require("../models/coupon.model");
const { computeTotals, sellingPrice } = require("../utils/pricing");
const { ROLES, ORDER_STATUS, PAYMENT_STATUS } = require("../constants");
const { notifyOrderConfirmation, notifyOrderStatus } = require("../helpers/orderNotifications");

// Applies the one-time side effects of a placed order: decrement stock, count
// the coupon, and empty the buyer's cart. Called immediately for COD, but only
// AFTER payment is verified for online orders (so a cancelled payment doesn't
// wipe the cart or hold stock). Safe to guard against double-calls by the
// caller (only run on the pending -> paid transition).
const finalizeOrder = async (order) => {
  await Promise.all(
    order.items.map((it) =>
      Product.findByIdAndUpdate(it.product, { $inc: { stock: -it.quantity } })
    )
  );
  if (order.coupon) {
    await Coupon.findByIdAndUpdate(order.coupon, { $inc: { usedCount: 1 } });
  }
  const cart = await Cart.findOne({ user: order.user });
  if (cart) {
    cart.items = [];
    cart.coupon = null;
    await cart.save();
  }

  // Fire-and-forget: email the buyer that we've received their order.
  notifyOrderConfirmation(order);
};

// POST /api/orders  (protected)
// Turns the user's current cart into an order. All prices are recomputed on
// the server so the client can never dictate what it pays.
const createOrder = async (req, res) => {
  try {
    const { shippingAddress, paymentMethod = "cod" } = req.body;
    if (!shippingAddress) {
      return res.status(400).json({ message: "Shipping address is required" });
    }

    const cart = await Cart.findOne({ user: req.user._id })
      .populate("items.product")
      .populate("items.design", "name thumbnail")
      .populate("coupon");

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ message: "Your cart is empty" });
    }

    // Keep only lines whose product still exists, and check stock.
    const items = cart.items.filter((i) => i.product);
    for (const item of items) {
      if (item.product.stock < item.quantity) {
        return res
          .status(400)
          .json({ message: `Not enough stock for ${item.product.name}` });
      }
      // Customizable products must carry a design (enforced at add-time too).
      if (item.product.customizable && !item.design) {
        return res
          .status(400)
          .json({ message: `${item.product.name} requires a design` });
      }
    }

    const totals = computeTotals(items, cart.coupon);

    // Snapshot each line into the order.
    const orderItems = items.map((item) => ({
      product: item.product._id,
      name: item.product.name,
      price: sellingPrice(item.product),
      quantity: item.quantity,
      image: item.product.images?.[0]?.url,
      design: item.design?._id || item.design || null,
      designThumbnail: item.design?.thumbnail,
    }));

    const order = await Order.create({
      user: req.user._id,
      items: orderItems,
      shippingAddress,
      coupon: cart.coupon ? cart.coupon._id : null,
      paymentMethod,
      ...totals,
    });

    // COD is placed immediately. For online payment we keep the cart and stock
    // intact until the payment is verified (payment.controller calls finalize).
    if (paymentMethod === "cod") {
      await finalizeOrder(order);
    }

    res.status(201).json(order);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// GET /api/orders/my  (protected) - the logged-in user's orders
const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.status(200).json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/orders/:id  (protected) - owner or admin only
const getOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate("user", "name email");
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const isOwner = order.user._id.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== ROLES.ADMIN) {
      return res.status(403).json({ message: "Not authorized to view this order" });
    }

    res.status(200).json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/orders  (admin) - all orders
const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find({})
      .populate("user", "name email")
      .sort({ createdAt: -1 });
    res.status(200).json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PUT /api/orders/:id/status  (admin) - move the order through its lifecycle
const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!Object.values(ORDER_STATUS).includes(status)) {
      return res.status(400).json({ message: "Invalid order status" });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    order.orderStatus = status;
    if (status === ORDER_STATUS.DELIVERED) {
      order.deliveredAt = new Date();
      if (order.paymentMethod === "cod") order.paymentStatus = PAYMENT_STATUS.PAID;
    }
    await order.save();

    // Fire-and-forget: email the buyer about the new status.
    notifyOrderStatus(order, status);

    res.status(200).json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PUT /api/orders/:id/cancel  (protected) - customer cancels an early-stage order
const cancelOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const cancellable = [ORDER_STATUS.PENDING, ORDER_STATUS.CONFIRMED];
    if (!cancellable.includes(order.orderStatus)) {
      return res
        .status(400)
        .json({ message: "Order can no longer be cancelled" });
    }

    order.orderStatus = ORDER_STATUS.CANCELLED;
    await order.save();

    // Only put stock back if it was ever taken. COD and paid online orders were
    // finalized (stock decremented); an unpaid online order never took stock.
    const stockWasTaken =
      order.paymentMethod === "cod" || order.paymentStatus === PAYMENT_STATUS.PAID;
    if (stockWasTaken) {
      await Promise.all(
        order.items.map((item) =>
          Product.findByIdAndUpdate(item.product, {
            $inc: { stock: item.quantity },
          })
        )
      );
    }

    res.status(200).json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createOrder,
  getMyOrders,
  getOrder,
  getAllOrders,
  updateOrderStatus,
  cancelOrder,
  finalizeOrder,
};

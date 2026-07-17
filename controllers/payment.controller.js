const crypto = require("crypto");
const Order = require("../models/order.model");
const env = require("../config/env");
const { getRazorpay } = require("../config/razorpay");
const { PAYMENT_STATUS, ORDER_STATUS } = require("../constants");
const { finalizeOrder } = require("./order.controller");

// Constant-time string compare, so signature checks don't leak timing info.
const safeEqual = (a, b) => {
  const ba = Buffer.from(a || "", "utf8");
  const bb = Buffer.from(b || "", "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
};

// POST /api/payments/create-order  (protected)
// Takes an existing (pending, razorpay) order and creates a matching Razorpay
// order. The client uses the returned data to open Razorpay Checkout.
const createRazorpayOrder = async (req, res) => {
  try {
    const { orderId } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized for this order" });
    }
    if (order.paymentMethod !== "razorpay") {
      return res.status(400).json({ message: "Order is not a Razorpay order" });
    }
    if (order.paymentStatus === PAYMENT_STATUS.PAID) {
      return res.status(400).json({ message: "Order is already paid" });
    }

    // Razorpay works in the smallest currency unit (paise for INR).
    const amount = Math.round(order.totalPrice * 100);

    const rpOrder = await getRazorpay().orders.create({
      amount,
      currency: "INR",
      receipt: order._id.toString(),
    });

    order.paymentInfo.razorpayOrderId = rpOrder.id;
    await order.save();

    res.status(201).json({
      key: env.razorpay.keyId, // public key id, safe to send to the client
      razorpayOrderId: rpOrder.id,
      amount,
      currency: "INR",
      orderId: order._id,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// POST /api/payments/verify  (protected)
// After the user pays, Razorpay Checkout hands the client three values. The
// client sends them here; we recompute the signature to prove the payment is
// genuine before marking the order paid.
const verifyPayment = async (req, res) => {
  try {
    const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized for this order" });
    }

    const wasPaid = order.paymentStatus === PAYMENT_STATUS.PAID;

    // Razorpay's rule: signature = HMAC_SHA256(order_id + "|" + payment_id, key_secret)
    const expected = crypto
      .createHmac("sha256", env.razorpay.keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (!safeEqual(expected, razorpay_signature)) {
      order.paymentStatus = PAYMENT_STATUS.FAILED;
      await order.save();
      return res.status(400).json({ message: "Payment verification failed" });
    }

    order.paymentStatus = PAYMENT_STATUS.PAID;
    order.orderStatus = ORDER_STATUS.CONFIRMED;
    order.paymentInfo.razorpayOrderId = razorpay_order_id;
    order.paymentInfo.razorpayPaymentId = razorpay_payment_id;
    order.paymentInfo.razorpaySignature = razorpay_signature;
    await order.save();

    // Apply stock/coupon/cart side effects once, on the first successful verify.
    if (!wasPaid) {
      await finalizeOrder(order);
    }

    res.status(200).json({ message: "Payment verified", order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/payments/webhook  (public - secured by signature)
// Razorpay calls this server-to-server. It's the reliable source of truth:
// even if the browser closes mid-redirect, the webhook still confirms payment.
const webhook = async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];

    // req.rawBody is captured in app.js (express.json verify callback), because
    // the signature must be checked against the EXACT bytes Razorpay sent.
    const expected = crypto
      .createHmac("sha256", env.razorpay.webhookSecret || "")
      .update(req.rawBody || Buffer.from(""))
      .digest("hex");

    if (!safeEqual(expected, signature)) {
      return res.status(400).json({ message: "Invalid webhook signature" });
    }

    const event = req.body;
    const entity = event?.payload?.payment?.entity;

    if (entity?.order_id) {
      const order = await Order.findOne({
        "paymentInfo.razorpayOrderId": entity.order_id,
      });

      if (order) {
        if (event.event === "payment.captured") {
          const wasPaid = order.paymentStatus === PAYMENT_STATUS.PAID;
          order.paymentStatus = PAYMENT_STATUS.PAID;
          if (order.orderStatus === ORDER_STATUS.PENDING) {
            order.orderStatus = ORDER_STATUS.CONFIRMED;
          }
          order.paymentInfo.razorpayPaymentId = entity.id;
          await order.save();
          if (!wasPaid) {
            await finalizeOrder(order);
          }
        } else if (event.event === "payment.failed") {
          order.paymentStatus = PAYMENT_STATUS.FAILED;
          await order.save();
        }
      }
    }

    // Always 200 quickly so Razorpay doesn't keep retrying.
    res.status(200).json({ received: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/payments/refund/:orderId  (admin)
const refund = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    if (order.paymentStatus !== PAYMENT_STATUS.PAID) {
      return res.status(400).json({ message: "Only paid orders can be refunded" });
    }
    if (!order.paymentInfo.razorpayPaymentId) {
      return res.status(400).json({ message: "No payment id on this order" });
    }

    await getRazorpay().payments.refund(order.paymentInfo.razorpayPaymentId, {
      amount: Math.round(order.totalPrice * 100),
    });

    order.paymentStatus = PAYMENT_STATUS.REFUNDED;
    await order.save();

    res.status(200).json({ message: "Refund initiated", order });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  createRazorpayOrder,
  verifyPayment,
  webhook,
  refund,
};

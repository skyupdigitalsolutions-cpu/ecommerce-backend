const sendEmail = require("./sendEmail");
const User = require("../models/user.model");
const {
  orderConfirmationTemplate,
  orderStatusTemplate,
} = require("../templates/emails");

// These are called fire-and-forget from the order flow. They must NEVER throw
// (an email problem should not fail a checkout or a status update), so each one
// catches and logs its own errors.

const notifyOrderConfirmation = async (order) => {
  try {
    const user = await User.findById(order.user).select("name email");
    if (!user?.email) return;
    await sendEmail({
      to: user.email,
      subject: `Order received - #${order._id.toString().slice(-8)}`,
      html: orderConfirmationTemplate(user.name, order),
    });
  } catch (error) {
    console.error("[notify] order confirmation failed:", error.message);
  }
};

const notifyOrderStatus = async (order, status) => {
  try {
    const user = await User.findById(order.user).select("name email");
    if (!user?.email) return;
    await sendEmail({
      to: user.email,
      subject: `Order update - #${order._id.toString().slice(-8)} is ${status}`,
      html: orderStatusTemplate(user.name, order, status),
    });
  } catch (error) {
    console.error("[notify] order status failed:", error.message);
  }
};

module.exports = { notifyOrderConfirmation, notifyOrderStatus };

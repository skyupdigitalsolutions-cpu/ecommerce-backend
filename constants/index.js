// Shared constant values used across models, middleware and controllers.
// Keeping them here means the allowed values live in one place.

const ROLES = {
  CUSTOMER: "customer",
  ADMIN: "admin",
  DESIGNER: "designer",
  PRINTER: "printer",
  DELIVERY: "delivery",
};

const ORDER_STATUS = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  PROCESSING: "processing",
  PRINTING: "printing",
  QUALITY_CHECK: "quality_check",
  PACKED: "packed",
  SHIPPED: "shipped",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
  RETURNED: "returned",
};

const PAYMENT_STATUS = {
  PENDING: "pending",
  PAID: "paid",
  FAILED: "failed",
  REFUNDED: "refunded",
};

const COUPON_TYPE = {
  PERCENTAGE: "percentage",
  FIXED: "fixed",
};

module.exports = {
  ROLES,
  ORDER_STATUS,
  PAYMENT_STATUS,
  COUPON_TYPE,
};

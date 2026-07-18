const Order = require("../models/order.model");
const Product = require("../models/product.model");
const User = require("../models/user.model");
const { PAYMENT_STATUS } = require("../constants");

// All endpoints here are admin-only (guarded in the route). "Revenue" means
// realised revenue: the sum of paid orders (online-paid or COD-delivered, which
// gets marked paid on delivery).

// GET /api/admin/analytics/summary
const getSummary = async (req, res) => {
  try {
    const [revenueAgg] = await Order.aggregate([
      { $match: { paymentStatus: PAYMENT_STATUS.PAID } },
      { $group: { _id: null, revenue: { $sum: "$totalPrice" }, count: { $sum: 1 } } },
    ]);

    const byStatusAgg = await Order.aggregate([
      { $group: { _id: "$orderStatus", count: { $sum: 1 } } },
    ]);
    const ordersByStatus = {};
    byStatusAgg.forEach((s) => { ordersByStatus[s._id] = s.count; });

    const [totalOrders, totalUsers, totalProducts] = await Promise.all([
      Order.countDocuments(),
      User.countDocuments(),
      Product.countDocuments(),
    ]);

    res.status(200).json({
      revenue: revenueAgg ? revenueAgg.revenue : 0,
      paidOrders: revenueAgg ? revenueAgg.count : 0,
      totalOrders,
      totalUsers,
      totalProducts,
      ordersByStatus,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/admin/analytics/top-products?limit=5
const getTopProducts = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 5, 50);
    const top = await Order.aggregate([
      { $match: { paymentStatus: PAYMENT_STATUS.PAID } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product",
          name: { $first: "$items.name" },
          unitsSold: { $sum: "$items.quantity" },
          revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
        },
      },
      { $sort: { unitsSold: -1 } },
      { $limit: limit },
    ]);
    res.status(200).json(top);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/admin/analytics/sales-over-time?days=30
const getSalesOverTime = async (req, res) => {
  try {
    const days = Math.min(Number(req.query.days) || 30, 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const series = await Order.aggregate([
      { $match: { paymentStatus: PAYMENT_STATUS.PAID, createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          revenue: { $sum: "$totalPrice" },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: "$_id", revenue: 1, orders: 1 } },
    ]);
    res.status(200).json(series);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/admin/analytics/low-stock?threshold=5
const getLowStock = async (req, res) => {
  try {
    const threshold = Number(req.query.threshold) || 5;
    const products = await Product.find({ stock: { $lte: threshold } })
      .select("name stock")
      .sort({ stock: 1 });
    res.status(200).json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getSummary, getTopProducts, getSalesOverTime, getLowStock };

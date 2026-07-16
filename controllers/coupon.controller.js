const Coupon = require("../models/coupon.model");

// GET /api/coupons  (admin)
const getCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find({});
    res.status(200).json(coupons);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/coupons  (admin)
const createCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.create(req.body);
    res.status(201).json(coupon);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// PUT /api/coupons/:id  (admin)
const updateCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!coupon) {
      return res.status(404).json({ message: "Coupon not found" });
    }
    res.status(200).json(coupon);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// DELETE /api/coupons/:id  (admin)
const deleteCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) {
      return res.status(404).json({ message: "Coupon not found" });
    }
    res.status(200).json({ message: "Coupon deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
};

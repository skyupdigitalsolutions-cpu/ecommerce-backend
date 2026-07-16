const User = require("../models/user.model");
const { ROLES } = require("../constants");

// ---------- Admin: manage users ----------

// GET /api/users  (admin)
const getUsers = async (req, res) => {
  try {
    const users = await User.find({}).select("-password");
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/users/:id  (admin)
const getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PUT /api/users/:id/role  (admin)
const updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    if (!Object.values(ROLES).includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// DELETE /api/users/:id  (admin)
const deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ---------- Customer: address book ----------

// GET /api/users/me/addresses  (protected)
const getAddresses = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.status(200).json(user.addresses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/users/me/addresses  (protected)
const addAddress = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    // If this address is marked default, unset the flag on the others.
    if (req.body.isDefault) {
      user.addresses.forEach((a) => (a.isDefault = false));
    }
    user.addresses.push(req.body);
    await user.save();

    res.status(201).json(user.addresses);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// DELETE /api/users/me/addresses/:addressId  (protected)
const deleteAddress = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const address = user.addresses.id(req.params.addressId);
    if (!address) {
      return res.status(404).json({ message: "Address not found" });
    }
    address.deleteOne();
    await user.save();
    res.status(200).json(user.addresses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getUsers,
  getUser,
  updateUserRole,
  deleteUser,
  getAddresses,
  addAddress,
  deleteAddress,
};

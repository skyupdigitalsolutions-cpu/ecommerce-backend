const express = require("express");
const router = express.Router();

const {
  getUsers,
  getUser,
  updateUserRole,
  deleteUser,
  getAddresses,
  addAddress,
  deleteAddress,
} = require("../controllers/user.controller");

const { protect, authorize } = require("../middleware/auth.middleware");
const { ROLES } = require("../constants");

// ---- Customer address book (any logged-in user) ----
// Defined before "/:id" so "me" is never mistaken for a user id.
router.get("/me/addresses", protect, getAddresses);
router.post("/me/addresses", protect, addAddress);
router.delete("/me/addresses/:addressId", protect, deleteAddress);

// ---- Admin-only user management ----
router.get("/", protect, authorize(ROLES.ADMIN), getUsers);
router.get("/:id", protect, authorize(ROLES.ADMIN), getUser);
router.put("/:id/role", protect, authorize(ROLES.ADMIN), updateUserRole);
router.delete("/:id", protect, authorize(ROLES.ADMIN), deleteUser);

module.exports = router;

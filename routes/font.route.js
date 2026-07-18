const express = require("express");
const router = express.Router();

const {
  getFonts,
  createFont,
  updateFont,
  deleteFont,
} = require("../controllers/font.controller");

const { protect, authorize } = require("../middleware/auth.middleware");
const { ROLES } = require("../constants");

router.get("/", getFonts); // public

router.post("/", protect, authorize(ROLES.ADMIN), createFont);
router.put("/:id", protect, authorize(ROLES.ADMIN), updateFont);
router.delete("/:id", protect, authorize(ROLES.ADMIN), deleteFont);

module.exports = router;

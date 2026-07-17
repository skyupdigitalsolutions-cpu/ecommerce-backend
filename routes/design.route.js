const express = require("express");
const router = express.Router();

const {
  getMyDesigns,
  getDesign,
  createDesign,
  updateDesign,
  deleteDesign,
} = require("../controllers/design.controller");

const { protect } = require("../middleware/auth.middleware");

// Designs belong to a user, so every route requires login.
router.use(protect);

router.get("/", getMyDesigns);
router.post("/", createDesign);
router.get("/:id", getDesign);
router.put("/:id", updateDesign);
router.delete("/:id", deleteDesign);

module.exports = router;

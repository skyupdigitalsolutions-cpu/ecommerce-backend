const express = require("express");
const router = express.Router();

const {
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  useTemplate,
} = require("../controllers/template.controller");

const { protect, authorize } = require("../middleware/auth.middleware");
const { ROLES } = require("../constants");

// Public browsing.
router.get("/", getTemplates);
router.get("/:id", getTemplate);

// Any logged-in user can start a design from a template.
router.post("/:id/use", protect, useTemplate);

// Admin manages the template library.
router.post("/", protect, authorize(ROLES.ADMIN), createTemplate);
router.put("/:id", protect, authorize(ROLES.ADMIN), updateTemplate);
router.delete("/:id", protect, authorize(ROLES.ADMIN), deleteTemplate);

module.exports = router;

const express = require("express");
const router = express.Router();

const {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  getMe,
  updateProfile,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
} = require("../controllers/auth.controller");

const { protect } = require("../middleware/auth.middleware");
const { authLimiter } = require("../middleware/rateLimiter.middleware");
const validate = require("../middleware/validate.middleware");
const {
  registerRules,
  loginRules,
  forgotPasswordRules,
  resetPasswordRules,
} = require("../validations/auth.validation");

// The chain reads left to right: rate-limit -> validate input -> controller.
router.post("/register", authLimiter, registerRules, validate, register);
router.post("/login", authLimiter, loginRules, validate, login);
router.post("/refresh", refresh);
router.post("/logout", logout);
router.post("/logout-all", protect, logoutAll);

// Email verification: the link in the email hits this GET route.
router.get("/verify-email/:token", verifyEmail);
// Resend the verification email (must be logged in).
router.post("/resend-verification", protect, resendVerification);

router.post("/forgot-password", authLimiter, forgotPasswordRules, validate, forgotPassword);
router.post("/reset-password/:token", resetPasswordRules, validate, resetPassword);

// Protected: needs a valid Bearer access token.
router.get("/me", protect, getMe);
router.put("/me", protect, updateProfile);

module.exports = router;

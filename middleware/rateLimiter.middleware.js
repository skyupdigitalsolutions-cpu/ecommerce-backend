const rateLimit = require("express-rate-limit");

// Applied to all /api routes: a generous ceiling to stop abuse.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
});

// Stricter limiter for auth endpoints (login/register/forgot-password) to
// slow down brute-force and credential-stuffing attempts.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts, please try again later" },
});

module.exports = { apiLimiter, authLimiter };

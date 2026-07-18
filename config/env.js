// Loads environment variables once and exports them in one tidy object.
// Everything else in the app reads config from here instead of process.env
// directly, so it is easy to see (and change) all settings in one place.
require("dotenv").config();

const env = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || "development",
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",

  mongoUri: process.env.MONGO_URI || "mongodb://localhost:27017/ecommerce",

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpires: process.env.JWT_ACCESS_EXPIRES || "15m",
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpires: process.env.JWT_REFRESH_EXPIRES || "7d",
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },

  brevo: {
    apiKey: process.env.BREVO_API_KEY,
    fromName: process.env.EMAIL_FROM_NAME || "My Store",
    fromAddress: process.env.EMAIL_FROM_ADDRESS || "no-reply@mystore.com",
  },

  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",

  // When "true", checkout requires a verified email. Off by default so it can
  // be turned on per-environment without changing code.
  requireVerifiedEmail: process.env.REQUIRE_VERIFIED_EMAIL === "true",

  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  },
};

module.exports = env;

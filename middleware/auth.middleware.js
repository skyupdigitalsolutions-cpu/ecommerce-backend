const jwt = require("jsonwebtoken");
const User = require("../models/user.model");
const env = require("../config/env");

// protect: verifies the Bearer access token and attaches the user to req.user.
// Usage in a route:  router.get("/me", protect, getMe)
const protect = async (req, res, next) => {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Not authorized, no token" });
    }

    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, env.jwt.accessSecret);

    // Load the user (minus password) so downstream handlers have fresh data.
    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      return res.status(401).json({ message: "User no longer exists" });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Not authorized, token failed" });
  }
};

// authorize: restricts a route to one or more roles.
// Usage:  router.post("/", protect, authorize("admin"), createProduct)
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ message: "You do not have permission to perform this action" });
    }
    next();
  };
};

module.exports = { protect, authorize };

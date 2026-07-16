const jwt = require("jsonwebtoken");
const env = require("../config/env");

// A short-lived access token. The client sends this as:
//   Authorization: Bearer <accessToken>
const signAccessToken = (userId) => {
  return jwt.sign({ id: userId }, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessExpires,
  });
};

// A long-lived refresh token. We store it in an httpOnly cookie and use it
// at POST /api/auth/refresh to hand out a new access token.
const signRefreshToken = (userId) => {
  return jwt.sign({ id: userId }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpires,
  });
};

module.exports = { signAccessToken, signRefreshToken };

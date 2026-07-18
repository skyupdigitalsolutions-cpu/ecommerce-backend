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
// at POST /api/auth/refresh to hand out a new access token. It carries the
// user's tokenVersion so it can be revoked (see auth.controller refresh).
const signRefreshToken = (userId, tokenVersion = 0) => {
  return jwt.sign({ id: userId, tv: tokenVersion }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpires,
  });
};

module.exports = { signAccessToken, signRefreshToken };

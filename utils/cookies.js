const env = require("../config/env");

const REFRESH_COOKIE = "refreshToken";

// Store the refresh token in an httpOnly cookie so client-side JS cannot read
// it (protects against XSS). The access token, by contrast, is returned in the
// JSON body and kept in memory by the frontend.
const setRefreshCookie = (res, token) => {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};

const clearRefreshCookie = (res) => {
  res.clearCookie(REFRESH_COOKIE);
};

module.exports = { REFRESH_COOKIE, setRefreshCookie, clearRefreshCookie };

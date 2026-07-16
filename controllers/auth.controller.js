const jwt = require("jsonwebtoken");
const User = require("../models/user.model");
const env = require("../config/env");
const sendEmail = require("../helpers/sendEmail");
const { createToken, hashToken } = require("../utils/cryptoToken");
const { verifyEmailTemplate, resetPasswordTemplate } = require("../templates/emails");
const { signAccessToken, signRefreshToken } = require("../utils/generateToken");
const { setRefreshCookie, clearRefreshCookie, REFRESH_COOKIE } = require("../utils/cookies");

// Strip sensitive fields before sending a user back to the client.
const publicUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  phone: user.phone,
  avatar: user.avatar,
  isEmailVerified: user.isEmailVerified,
});

// Send the verification email. Wrapped so a mail-service hiccup never fails the
// surrounding request (in dev without a Brevo key, sendEmail just logs).
const sendVerificationEmail = async (email, name, rawToken) => {
  const url = `${env.clientUrl}/verify-email/${rawToken}`;
  try {
    await sendEmail({
      to: email,
      subject: "Verify your email",
      html: verifyEmailTemplate(name, url),
    });
  } catch (err) {
    console.log("Failed to send verification email:", err.message);
  }
};

// POST /api/auth/register
const register = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(409).json({ message: "Email already registered" });
    }

    // Generate a verification token, store its hash on the new user, email the raw one.
    const { raw, hashed } = createToken();
    const user = await User.create({
      name,
      email,
      password, // hashed automatically by the pre-save hook
      phone,
      emailVerificationToken: hashed,
      emailVerificationExpires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    });

    await sendVerificationEmail(user.email, user.name, raw);

    // The account is usable immediately; isEmailVerified stays false until they
    // click the link. Gate sensitive actions on it later if you want.
    const accessToken = signAccessToken(user._id);
    const refreshToken = signRefreshToken(user._id);
    setRefreshCookie(res, refreshToken);

    res.status(201).json({ user: publicUser(user), accessToken });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// POST /api/auth/login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Password has select:false on the schema, so ask for it explicitly.
    const user = await User.findOne({ email }).select("+password");
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const accessToken = signAccessToken(user._id);
    const refreshToken = signRefreshToken(user._id);
    setRefreshCookie(res, refreshToken);

    res.status(200).json({ user: publicUser(user), accessToken });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/auth/refresh  -> new access token using the refresh cookie
const refresh = async (req, res) => {
  try {
    const token = req.cookies[REFRESH_COOKIE];
    if (!token) {
      return res.status(401).json({ message: "No refresh token" });
    }

    const decoded = jwt.verify(token, env.jwt.refreshSecret);
    const accessToken = signAccessToken(decoded.id);

    res.status(200).json({ accessToken });
  } catch (error) {
    res.status(401).json({ message: "Invalid refresh token" });
  }
};

// POST /api/auth/logout
const logout = async (req, res) => {
  try {
    clearRefreshCookie(res);
    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/auth/me  (protected)
const getMe = async (req, res) => {
  try {
    res.status(200).json({ user: publicUser(req.user) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PUT /api/auth/me  (protected) - update own name/phone/avatar
const updateProfile = async (req, res) => {
  try {
    const { name, phone, avatar } = req.body;
    const user = await User.findById(req.user._id);

    if (name !== undefined) user.name = name;
    if (phone !== undefined) user.phone = phone;
    if (avatar !== undefined) user.avatar = avatar;

    await user.save();
    res.status(200).json({ user: publicUser(user) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/auth/verify-email/:token
const verifyEmail = async (req, res) => {
  try {
    const hashed = hashToken(req.params.token);

    const user = await User.findOne({
      emailVerificationToken: hashed,
      emailVerificationExpires: { $gt: Date.now() },
    }).select("+emailVerificationToken +emailVerificationExpires");

    if (!user) {
      return res
        .status(400)
        .json({ message: "Verification link is invalid or has expired" });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    res.status(200).json({ message: "Email verified successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/auth/resend-verification  (protected)
const resendVerification = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user.isEmailVerified) {
      return res.status(400).json({ message: "Email is already verified" });
    }

    const { raw, hashed } = createToken();
    user.emailVerificationToken = hashed;
    user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
    await user.save();

    await sendVerificationEmail(user.email, user.name, raw);
    res.status(200).json({ message: "Verification email sent" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/auth/forgot-password
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    // Always respond the same way so we don't reveal which emails exist.
    if (!user) {
      return res
        .status(200)
        .json({ message: "If that email exists, a reset link has been sent" });
    }

    const { raw, hashed } = createToken();
    user.passwordResetToken = hashed;
    user.passwordResetExpires = Date.now() + 15 * 60 * 1000; // 15 minutes
    await user.save();

    const url = `${env.clientUrl}/reset-password/${raw}`;
    try {
      await sendEmail({
        to: user.email,
        subject: "Reset your password",
        html: resetPasswordTemplate(user.name, url),
      });
    } catch (err) {
      console.log("Failed to send reset email:", err.message);
    }

    res
      .status(200)
      .json({ message: "If that email exists, a reset link has been sent" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/auth/reset-password/:token
const resetPassword = async (req, res) => {
  try {
    const hashed = hashToken(req.params.token);

    const user = await User.findOne({
      passwordResetToken: hashed,
      passwordResetExpires: { $gt: Date.now() },
    }).select("+passwordResetToken +passwordResetExpires");

    if (!user) {
      return res.status(400).json({ message: "Token is invalid or has expired" });
    }

    user.password = req.body.password; // re-hashed by the pre-save hook
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  register,
  login,
  refresh,
  logout,
  getMe,
  updateProfile,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
};

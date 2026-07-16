// Focused test for the email-verification and password-reset flows.
//
// Because emails aren't actually delivered in a test run, we can't read the
// raw token from an inbox. Instead we inject a KNOWN token's hash into the DB
// (exactly what the server stores) and then call the endpoint with the known
// raw token - which is a faithful stand-in for the user clicking the link.
//
// PREREQUISITES: MongoDB running + server running (npm run dev).
// RUN:           node tests/auth-extra.test.js

require("dotenv").config();
const mongoose = require("mongoose");
const env = require("../config/env");
const User = require("../models/user.model");
const { hashToken } = require("../utils/cryptoToken");

const ROOT = process.env.TEST_URL || `http://localhost:${env.port}`;
const API = `${ROOT}/api`;

let pass = 0, fail = 0;
const G = "\x1b[32m", R = "\x1b[31m", D = "\x1b[2m", X = "\x1b[0m";
const check = (name, ok, extra) => {
  if (ok) { pass++; console.log(`  ${G}\u2713${X} ${name}`); }
  else { fail++; console.log(`  ${R}\u2717${X} ${name}${extra ? `  ${D}(${extra})${X}` : ""}`); }
};
const section = (t) => console.log(`\n${t}`);

const api = async (method, path, { token, body } = {}) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
};

const stamp = Date.now();
const email = `verify_${stamp}@test.com`;
const oldPassword = "Passw0rd!";
const newPassword = "NewPass1!";

const main = async () => {
  console.log(`\nTesting auth extras at ${API}\n${"=".repeat(50)}`);

  // Register a fresh user.
  let r = await api("POST", "/auth/register", {
    body: { name: "Verify Tester", email, password: oldPassword },
  });
  const token = r.data.accessToken;
  const userId = r.data.user?._id;
  check("register -> 201 (isEmailVerified false)", r.status === 201 && r.data.user?.isEmailVerified === false);

  // ---------- Email verification ----------
  section("Email verification");
  r = await api("GET", "/auth/verify-email/not-a-real-token");
  check("verify with bad token -> 400", r.status === 400);

  // Inject a known verification token hash.
  const knownVerify = "known-verify-token-123";
  await User.findByIdAndUpdate(userId, {
    emailVerificationToken: hashToken(knownVerify),
    emailVerificationExpires: Date.now() + 60 * 60 * 1000,
  });

  r = await api("GET", `/auth/verify-email/${knownVerify}`);
  check("verify with valid token -> 200", r.status === 200, `status ${r.status}`);

  const afterVerify = await User.findById(userId);
  check("user is now isEmailVerified = true", afterVerify.isEmailVerified === true);
  check("verification token cleared after use", !afterVerify.emailVerificationToken);

  r = await api("POST", "/auth/resend-verification", { token });
  check("resend when already verified -> 400", r.status === 400);

  // ---------- Password reset ----------
  section("Password reset");
  r = await api("POST", "/auth/forgot-password", { body: { email } });
  check("forgot-password -> 200 (generic message)", r.status === 200);

  r = await api("POST", "/auth/forgot-password", { body: { email: "nobody@nowhere.com" } });
  check("forgot-password unknown email -> 200 (no leak)", r.status === 200);

  // Inject a known reset token hash.
  const knownReset = "known-reset-token-456";
  await User.findByIdAndUpdate(userId, {
    passwordResetToken: hashToken(knownReset),
    passwordResetExpires: Date.now() + 15 * 60 * 1000,
  });

  r = await api("POST", "/auth/reset-password/wrong-token", { body: { password: newPassword } });
  check("reset with bad token -> 400", r.status === 400);

  r = await api("POST", `/auth/reset-password/${knownReset}`, { body: { password: newPassword } });
  check("reset with valid token -> 200", r.status === 200, `status ${r.status}`);

  r = await api("POST", "/auth/login", { body: { email, password: newPassword } });
  check("login with NEW password -> 200", r.status === 200);

  r = await api("POST", "/auth/login", { body: { email, password: oldPassword } });
  check("login with OLD password -> 401", r.status === 401);

  // Cleanup
  await User.deleteOne({ _id: userId });

  console.log(`\n${"=".repeat(50)}`);
  console.log(`${pass} passed, ${fail} failed`);
  console.log(fail === 0 ? `${G}Auth extras working \u2705${X}\n` : `${R}Some checks failed \u2717${X}\n`);
};

mongoose
  .connect(env.mongoUri)
  .then(main)
  .catch((err) => { console.error(`${R}Test error:${X}`, err.message); fail++; })
  .finally(async () => { await mongoose.disconnect(); process.exit(fail === 0 ? 0 : 1); });

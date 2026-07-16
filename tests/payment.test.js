// Test for the Razorpay payment logic that can run WITHOUT hitting Razorpay's
// live API: signature verification and the webhook. Both are pure HMAC, so as
// long as the test and the server share the same secrets (from .env), we can
// generate valid/invalid signatures locally and assert the server's behaviour.
//
// The create-order and refund endpoints DO call Razorpay's API, so those are
// exercised manually with real test keys (see the notes at the end).
//
// PREREQUISITES:
//   - MongoDB running, server running (npm run dev)
//   - In .env, set ANY non-empty values (dummy is fine for this test):
//       RAZORPAY_KEY_SECRET=test_secret
//       RAZORPAY_WEBHOOK_SECRET=test_webhook_secret
//
// RUN:  node tests/payment.test.js

require("dotenv").config();
const crypto = require("crypto");
const mongoose = require("mongoose");
const env = require("../config/env");
const User = require("../models/user.model");
const Order = require("../models/order.model");

const ROOT = process.env.TEST_URL || `http://localhost:${env.port}`;
const API = `${ROOT}/api`;

let pass = 0, fail = 0;
const G = "\x1b[32m", R = "\x1b[31m", D = "\x1b[2m", Y = "\x1b[33m", X = "\x1b[0m";
const check = (name, ok, extra) => {
  if (ok) { pass++; console.log(`  ${G}\u2713${X} ${name}`); }
  else { fail++; console.log(`  ${R}\u2717${X} ${name}${extra ? `  ${D}(${extra})${X}` : ""}`); }
};
const section = (t) => console.log(`\n${t}`);

const api = async (method, path, { token, body, headers = {}, rawBody } = {}) => {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body || rawBody) h["Content-Type"] = "application/json";
  const res = await fetch(`${API}${path}`, {
    method,
    headers: h,
    body: rawBody !== undefined ? rawBody : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
};

const stamp = Date.now();
const password = "Passw0rd!";

const main = async () => {
  console.log(`\nTesting payments at ${API}\n${"=".repeat(50)}`);

  if (!env.razorpay.keySecret || !env.razorpay.webhookSecret) {
    console.log(`${Y}Skipped:${X} set RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET in .env`);
    console.log("(dummy values are fine) then restart the server and re-run.\n");
    return;
  }

  // ---- setup: customer, admin, product, order (paymentMethod razorpay) ----
  section("Setup");
  const custEmail = `pay_c_${stamp}@test.com`;
  const adminEmail = `pay_a_${stamp}@test.com`;

  let r = await api("POST", "/auth/register", { body: { name: "Cust", email: custEmail, password } });
  const custToken = r.data.accessToken;
  const custId = r.data.user?._id;

  r = await api("POST", "/auth/register", { body: { name: "Adm", email: adminEmail, password } });
  const adminId = r.data.user?._id;
  await User.findByIdAndUpdate(adminId, { role: "admin" });
  r = await api("POST", "/auth/login", { body: { email: adminEmail, password } });
  const adminToken = r.data.accessToken;

  r = await api("POST", "/categories", { token: adminToken, body: { name: `PayCat ${stamp}` } });
  const categoryId = r.data._id;
  r = await api("POST", "/products", {
    token: adminToken,
    body: { name: `PayProd ${stamp}`, category: categoryId, price: 500, stock: 10 },
  });
  const productId = r.data._id;

  await api("POST", "/cart", { token: custToken, body: { productId, quantity: 1 } });
  r = await api("POST", "/orders", {
    token: custToken,
    body: {
      shippingAddress: { line1: "1 St", city: "Pune", state: "MH", postalCode: "411001" },
      paymentMethod: "razorpay",
    },
  });
  const orderId = r.data._id;
  check("order created with paymentMethod razorpay + status pending",
    r.status === 201 && r.data.paymentStatus === "pending", `status ${r.status}`);

  // ---- signature verification ----
  section("Payment verification (signature)");
  const rzpOrderId = "order_TEST" + stamp;
  const rzpPaymentId = "pay_TEST" + stamp;
  const validSig = crypto
    .createHmac("sha256", env.razorpay.keySecret)
    .update(`${rzpOrderId}|${rzpPaymentId}`)
    .digest("hex");

  r = await api("POST", "/payments/verify", {
    token: custToken,
    body: {
      orderId,
      razorpay_order_id: rzpOrderId,
      razorpay_payment_id: rzpPaymentId,
      razorpay_signature: "totally-wrong-signature",
    },
  });
  check("verify with BAD signature -> 400", r.status === 400);

  let dbOrder = await Order.findById(orderId);
  check("order marked failed after bad signature", dbOrder.paymentStatus === "failed");

  r = await api("POST", "/payments/verify", {
    token: custToken,
    body: {
      orderId,
      razorpay_order_id: rzpOrderId,
      razorpay_payment_id: rzpPaymentId,
      razorpay_signature: validSig,
    },
  });
  check("verify with VALID signature -> 200", r.status === 200, `status ${r.status}`);

  dbOrder = await Order.findById(orderId);
  check("order marked paid + confirmed", dbOrder.paymentStatus === "paid" && dbOrder.orderStatus === "confirmed");

  r = await api("POST", "/payments/verify", { token: custToken, body: { orderId, razorpay_order_id: rzpOrderId, razorpay_payment_id: rzpPaymentId, razorpay_signature: validSig } });
  // still 200 (idempotent-ish; already paid) - just confirm it doesn't error
  check("re-verify does not error", r.status === 200 || r.status === 400);

  // ---- webhook ----
  section("Webhook (signature over raw body)");
  // Point a fresh order's razorpayOrderId so the webhook can find it.
  const rzpOrderId2 = "order_WH" + stamp;
  await Order.findByIdAndUpdate(orderId, {
    paymentStatus: "pending",
    "paymentInfo.razorpayOrderId": rzpOrderId2,
  });

  const payload = JSON.stringify({
    event: "payment.captured",
    payload: { payment: { entity: { id: "pay_WH" + stamp, order_id: rzpOrderId2 } } },
  });
  const whSig = crypto.createHmac("sha256", env.razorpay.webhookSecret).update(payload).digest("hex");

  r = await api("POST", "/payments/webhook", { rawBody: payload, headers: { "x-razorpay-signature": "bad" } });
  check("webhook BAD signature -> 400", r.status === 400);

  r = await api("POST", "/payments/webhook", { rawBody: payload, headers: { "x-razorpay-signature": whSig } });
  check("webhook VALID signature -> 200", r.status === 200, `status ${r.status}`);

  dbOrder = await Order.findById(orderId);
  check("webhook payment.captured marked order paid", dbOrder.paymentStatus === "paid");

  // ---- permissions ----
  section("Permissions");
  r = await api("POST", `/payments/refund/${orderId}`, { token: custToken });
  check("customer hits refund -> 403", r.status === 403);

  // ---- cleanup ----
  await Promise.all([
    Order.deleteOne({ _id: orderId }),
    User.deleteMany({ _id: { $in: [custId, adminId] } }),
    mongoose.connection.collection("carts").deleteMany({ user: { $in: [custId, adminId] } }),
    mongoose.connection.collection("products").deleteMany({ _id: new mongoose.Types.ObjectId(productId) }),
    mongoose.connection.collection("categories").deleteMany({ _id: new mongoose.Types.ObjectId(categoryId) }),
  ]);

  console.log(`\n${"=".repeat(50)}`);
  console.log(`${pass} passed, ${fail} failed`);
  console.log(fail === 0 ? `${G}Payment logic working \u2705${X}` : `${R}Some checks failed \u2717${X}`);
  console.log(`${D}Note: create-order + refund call Razorpay's live API - test those with real test keys.${X}\n`);
};

mongoose
  .connect(env.mongoUri)
  .then(main)
  .catch((err) => { console.error(`${R}Test error:${X}`, err.message); fail++; })
  .finally(async () => { await mongoose.disconnect(); process.exit(fail === 0 ? 0 : 1); });

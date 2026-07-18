// Tests the refund endpoint's guard + validation logic (all offline).
// The actual Razorpay refund call needs a real captured payment, so completing
// a real refund is a manual step (see the note printed at the end / TESTING).
//
// PREREQUISITES: MongoDB + server running (npm run dev).
// RUN: node tests/refund.test.js

require("dotenv").config();
const mongoose = require("mongoose");
const env = require("../config/env");
const User = require("../models/user.model");
const Order = require("../models/order.model");

const ROOT = process.env.TEST_URL || `http://localhost:${env.port}`;
const API = `${ROOT}/api`;

let pass = 0, fail = 0;
const G = "\x1b[32m", R = "\x1b[31m", D = "\x1b[2m", X = "\x1b[0m";
const check = (n, ok, extra) => {
  if (ok) { pass++; console.log(`  ${G}\u2713${X} ${n}`); }
  else { fail++; console.log(`  ${R}\u2717${X} ${n}${extra ? `  ${D}(${extra})${X}` : ""}`); }
};

const api = async (method, path, { token, body } = {}) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
};

const stamp = Date.now();
const password = "Passw0rd!";
const created = { products: [], categories: [], users: [], orders: [] };

const main = async () => {
  console.log(`\nTesting refund guards at ${API}\n${"=".repeat(50)}`);

  // customer + admin
  let r = await api("POST", "/auth/register", { body: { name: "RfCust", email: `rf_c_${stamp}@test.com`, password } });
  const custToken = r.data.accessToken; const custId = r.data.user._id; created.users.push(custId);
  r = await api("POST", "/auth/register", { body: { name: "RfAdm", email: `rf_a_${stamp}@test.com`, password } });
  const adminId = r.data.user._id; created.users.push(adminId);
  await User.findByIdAndUpdate(adminId, { role: "admin" });
  r = await api("POST", "/auth/login", { body: { email: `rf_a_${stamp}@test.com`, password } });
  const adminToken = r.data.accessToken;

  // product + a COD order to refund against
  r = await api("POST", "/categories", { token: adminToken, body: { name: `RfCat ${stamp}` } });
  const categoryId = r.data._id; created.categories.push(categoryId);
  r = await api("POST", "/products", { token: adminToken, body: { name: `RfProd ${stamp}`, category: categoryId, price: 300, stock: 10 } });
  const productId = r.data._id; created.products.push(productId);
  await api("POST", "/cart", { token: custToken, body: { productId, quantity: 1 } });
  r = await api("POST", "/orders", { token: custToken, body: { shippingAddress: { line1: "1 St", city: "Pune", state: "MH", postalCode: "411001" }, paymentMethod: "cod" } });
  const orderId = r.data._id; created.orders.push(orderId);

  // customer (non-admin) cannot refund -> 403
  r = await api("POST", `/payments/refund/${orderId}`, { token: custToken });
  check("non-admin refund -> 403", r.status === 403, `status ${r.status}`);

  // admin refund non-existent order -> 404
  r = await api("POST", `/payments/refund/${new mongoose.Types.ObjectId()}`, { token: adminToken });
  check("refund missing order -> 404", r.status === 404, `status ${r.status}`);

  // admin refund an unpaid order -> 400
  r = await api("POST", `/payments/refund/${orderId}`, { token: adminToken });
  check("refund unpaid order -> 400", r.status === 400 && /paid/i.test(r.data.message), r.data.message);

  // mark the order paid but WITHOUT a razorpay payment id -> 400
  await Order.findByIdAndUpdate(orderId, { paymentStatus: "paid" });
  r = await api("POST", `/payments/refund/${orderId}`, { token: adminToken });
  check("refund paid order w/o payment id -> 400", r.status === 400 && /payment id/i.test(r.data.message), r.data.message);

  // cleanup
  const oid = (id) => new mongoose.Types.ObjectId(id);
  await Promise.all([
    User.deleteMany({ _id: { $in: created.users.map(oid) } }),
    mongoose.connection.collection("orders").deleteMany({ _id: { $in: created.orders.map(oid) } }),
    mongoose.connection.collection("carts").deleteMany({ user: oid(custId) }),
    mongoose.connection.collection("products").deleteMany({ _id: { $in: created.products.map(oid) } }),
    mongoose.connection.collection("categories").deleteMany({ _id: { $in: created.categories.map(oid) } }),
  ]);

  console.log(`\n${"=".repeat(50)}`);
  console.log(`${pass} passed, ${fail} failed`);
  console.log(fail === 0 ? `${G}Refund guards working \u2705${X}` : `${R}Some checks failed \u2717${X}`);
  console.log(`${D}Note: a real refund hits Razorpay's live API - test it on an actual paid order (see below).${X}\n`);
};

mongoose.connect(env.mongoUri).then(main)
  .catch((e) => { console.error(`${R}Test error:${X}`, e.message); fail++; })
  .finally(async () => { await mongoose.disconnect(); process.exit(fail === 0 ? 0 : 1); });

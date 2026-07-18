// Tests order notifications:
//  - unit: the two email templates render the right content (pure, offline)
//  - integration: placing an order and updating its status still succeed with
//    the notification hooks in place (emails are fire-and-forget; with no
//    BREVO_API_KEY sendEmail just logs, so nothing is actually emailed).
//
// PREREQUISITES: MongoDB + server running (npm run dev).
// RUN: node tests/notification.test.js

require("dotenv").config();
const mongoose = require("mongoose");
const env = require("../config/env");
const User = require("../models/user.model");
const { orderConfirmationTemplate, orderStatusTemplate } = require("../templates/emails");

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
  console.log(`\nTesting notifications at ${API}\n${"=".repeat(50)}`);

  // ---- unit: templates ----
  const fakeOrder = {
    _id: new mongoose.Types.ObjectId(),
    totalPrice: 581,
    paymentMethod: "razorpay",
    createdAt: new Date(),
    items: [{ name: "Business Card", quantity: 2, price: 225 }],
  };
  const conf = orderConfirmationTemplate("Alice", fakeOrder);
  check("confirmation template includes name", conf.includes("Alice"));
  check("confirmation template includes total", conf.includes("581"));
  check("confirmation template lists item", conf.includes("Business Card"));

  const stat = orderStatusTemplate("Alice", fakeOrder, "shipped");
  check("status template includes name", stat.includes("Alice"));
  check("status template shows status", stat.toLowerCase().includes("shipped"));

  // ---- integration: order + status update with hooks ----
  let r = await api("POST", "/auth/register", { body: { name: "NotCust", email: `nt_c_${stamp}@test.com`, password } });
  const custToken = r.data.accessToken; const custId = r.data.user._id; created.users.push(custId);
  r = await api("POST", "/auth/register", { body: { name: "NotAdm", email: `nt_a_${stamp}@test.com`, password } });
  const adminId = r.data.user._id; created.users.push(adminId);
  await User.findByIdAndUpdate(adminId, { role: "admin" });
  r = await api("POST", "/auth/login", { body: { email: `nt_a_${stamp}@test.com`, password } });
  const adminToken = r.data.accessToken;

  r = await api("POST", "/categories", { token: adminToken, body: { name: `NtCat ${stamp}` } });
  const categoryId = r.data._id; created.categories.push(categoryId);
  r = await api("POST", "/products", { token: adminToken, body: { name: `NtProd ${stamp}`, category: categoryId, price: 250, stock: 10 } });
  const productId = r.data._id; created.products.push(productId);

  await api("POST", "/cart", { token: custToken, body: { productId, quantity: 1 } });
  r = await api("POST", "/orders", { token: custToken, body: { shippingAddress: { line1: "1 St", city: "Pune", state: "MH", postalCode: "411001" }, paymentMethod: "cod" } });
  const orderId = r.data._id; created.orders.push(orderId);
  check("place order (fires confirmation email) -> 201", r.status === 201, `status ${r.status}`);

  r = await api("PUT", `/orders/${orderId}/status`, { token: adminToken, body: { status: "shipped" } });
  check("update status (fires status email) -> 200", r.status === 200 && r.data.orderStatus === "shipped", `status ${r.status}`);

  r = await api("PUT", `/orders/${orderId}/status`, { token: adminToken, body: { status: "delivered" } });
  check("deliver -> 200 (and COD marked paid)", r.status === 200 && r.data.orderStatus === "delivered" && r.data.paymentStatus === "paid", `pay=${r.data.paymentStatus}`);

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
  console.log(fail === 0 ? `${G}Notifications working \u2705${X}` : `${R}Some checks failed \u2717${X}`);
  console.log(`${D}Emails are fire-and-forget; set BREVO_API_KEY to actually send (else they just log).${X}\n`);
};

mongoose.connect(env.mongoUri).then(main)
  .catch((e) => { console.error(`${R}Test error:${X}`, e.message); fail++; })
  .finally(async () => { await mongoose.disconnect(); process.exit(fail === 0 ? 0 : 1); });

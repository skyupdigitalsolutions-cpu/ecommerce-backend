// Tests shipping: status timeline on orders + the admin shipping endpoint
// (courier/tracking + auto "shipped" + timeline entry + notification).
//
// PREREQUISITES: MongoDB + server running (npm run dev).
// RUN: node tests/shipping.test.js

require("dotenv").config();
const mongoose = require("mongoose");
const env = require("../config/env");
const User = require("../models/user.model");

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
  console.log(`\nTesting shipping at ${API}\n${"=".repeat(50)}`);

  let r = await api("POST", "/auth/register", { body: { name: "ShCust", email: `sh_c_${stamp}@test.com`, password } });
  const custToken = r.data.accessToken; const custId = r.data.user._id; created.users.push(custId);
  r = await api("POST", "/auth/register", { body: { name: "ShAdm", email: `sh_a_${stamp}@test.com`, password } });
  const adminId = r.data.user._id; created.users.push(adminId);
  await User.findByIdAndUpdate(adminId, { role: "admin" });
  r = await api("POST", "/auth/login", { body: { email: `sh_a_${stamp}@test.com`, password } });
  const adminToken = r.data.accessToken;

  r = await api("POST", "/categories", { token: adminToken, body: { name: `ShCat ${stamp}` } });
  const categoryId = r.data._id; created.categories.push(categoryId);
  r = await api("POST", "/products", { token: adminToken, body: { name: `ShProd ${stamp}`, category: categoryId, price: 400, stock: 10 } });
  const productId = r.data._id; created.products.push(productId);

  await api("POST", "/cart", { token: custToken, body: { productId, quantity: 1 } });
  r = await api("POST", "/orders", { token: custToken, body: { shippingAddress: { line1: "1 St", city: "Pune", state: "MH", postalCode: "411001" }, paymentMethod: "cod" } });
  const orderId = r.data._id; created.orders.push(orderId);
  check("order created with initial timeline", r.status === 201 && Array.isArray(r.data.statusHistory) && r.data.statusHistory[0]?.status === "pending", JSON.stringify(r.data.statusHistory));

  // status change appends to timeline
  r = await api("PUT", `/orders/${orderId}/status`, { token: adminToken, body: { status: "processing" } });
  check("status update -> 200", r.status === 200 && r.data.orderStatus === "processing");
  check("timeline recorded processing", r.data.statusHistory.some((h) => h.status === "processing"));

  // non-admin cannot set shipping
  r = await api("PUT", `/orders/${orderId}/shipping`, { token: custToken, body: { courier: "BlueDart", trackingId: "BD123" } });
  check("non-admin shipping -> 403", r.status === 403, `status ${r.status}`);

  // admin sets shipping -> stores courier/tracking, marks shipped, logs timeline
  r = await api("PUT", `/orders/${orderId}/shipping`, { token: adminToken, body: { courier: "BlueDart", trackingId: "BD123" } });
  check("admin shipping -> 200", r.status === 200, `status ${r.status}`);
  check("courier + tracking stored", r.data.courier === "BlueDart" && r.data.trackingId === "BD123");
  check("order auto-marked shipped", r.data.orderStatus === "shipped");
  check("timeline has shipped w/ note", r.data.statusHistory.some((h) => h.status === "shipped" && /BlueDart/.test(h.note || "")));

  // fetching the order shows shipping + full timeline
  r = await api("GET", `/orders/${orderId}`, { token: custToken });
  check("GET order shows tracking", r.status === 200 && r.data.trackingId === "BD123");
  check("timeline has >= 3 entries", r.data.statusHistory.length >= 3, `len ${r.data.statusHistory?.length}`);

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
  console.log(fail === 0 ? `${G}Shipping working \u2705${X}\n` : `${R}Some checks failed \u2717${X}\n`);
};

mongoose.connect(env.mongoUri).then(main)
  .catch((e) => { console.error(`${R}Test error:${X}`, e.message); fail++; })
  .finally(async () => { await mongoose.disconnect(); process.exit(fail === 0 ? 0 : 1); });

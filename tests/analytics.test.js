// Tests the admin analytics endpoints. Analytics aggregate over the whole DB,
// so assertions are written to be robust against pre-existing data (e.g. the
// figures must be >= what this test just created, and our specific product must
// appear), rather than expecting exact totals.
//
// PREREQUISITES: MongoDB + server running (npm run dev).
// RUN: node tests/analytics.test.js

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
  console.log(`\nTesting analytics at ${API}\n${"=".repeat(50)}`);

  // customer + admin
  let r = await api("POST", "/auth/register", { body: { name: "AnCust", email: `an_c_${stamp}@test.com`, password } });
  const custToken = r.data.accessToken; const custId = r.data.user._id; created.users.push(custId);
  r = await api("POST", "/auth/register", { body: { name: "AnAdm", email: `an_a_${stamp}@test.com`, password } });
  const adminId = r.data.user._id; created.users.push(adminId);
  await User.findByIdAndUpdate(adminId, { role: "admin" });
  r = await api("POST", "/auth/login", { body: { email: `an_a_${stamp}@test.com`, password } });
  const adminToken = r.data.accessToken;

  // product with low stock, then a paid (delivered COD) order for it
  r = await api("POST", "/categories", { token: adminToken, body: { name: `AnCat ${stamp}` } });
  const categoryId = r.data._id; created.categories.push(categoryId);
  r = await api("POST", "/products", { token: adminToken, body: { name: `AnProd ${stamp}`, category: categoryId, price: 500, stock: 3 } });
  const productId = r.data._id; created.products.push(productId);

  await api("POST", "/cart", { token: custToken, body: { productId, quantity: 2 } });
  r = await api("POST", "/orders", { token: custToken, body: { shippingAddress: { line1: "1 St", city: "Pune", state: "MH", postalCode: "411001" }, paymentMethod: "cod" } });
  const orderId = r.data._id; created.orders.push(orderId);
  const orderTotal = r.data.totalPrice;
  // deliver -> marks COD order paid (counts as revenue)
  await api("PUT", `/orders/${orderId}/status`, { token: adminToken, body: { status: "delivered" } });

  // permission guard
  r = await api("GET", "/admin/analytics/summary", { token: custToken });
  check("non-admin analytics -> 403", r.status === 403, `status ${r.status}`);

  // summary
  r = await api("GET", "/admin/analytics/summary", { token: adminToken });
  const s = r.data;
  check("summary -> 200", r.status === 200, `status ${r.status}`);
  check("revenue >= our order total", typeof s.revenue === "number" && s.revenue >= orderTotal, `revenue=${s.revenue} orderTotal=${orderTotal}`);
  check("totalOrders >= 1", s.totalOrders >= 1);
  check("ordersByStatus has 'delivered'", s.ordersByStatus && s.ordersByStatus.delivered >= 1, JSON.stringify(s.ordersByStatus));

  // top-products includes our product
  r = await api("GET", "/admin/analytics/top-products?limit=50", { token: adminToken });
  const mine = Array.isArray(r.data) && r.data.find((p) => p._id === productId);
  check("top-products -> 200 array", r.status === 200 && Array.isArray(r.data));
  check("our product appears with unitsSold >= 2", !!mine && mine.unitsSold >= 2, JSON.stringify(mine));

  // sales-over-time
  r = await api("GET", "/admin/analytics/sales-over-time?days=7", { token: adminToken });
  check("sales-over-time -> 200 array", r.status === 200 && Array.isArray(r.data) && r.data.length >= 1, `len ${r.data?.length}`);
  check("each point has date + revenue", r.data.every((d) => typeof d.date === "string" && typeof d.revenue === "number"));

  // low-stock includes our product (stock 3 -> 1 after the qty-2 order)
  r = await api("GET", "/admin/analytics/low-stock?threshold=5", { token: adminToken });
  const low = Array.isArray(r.data) && r.data.find((p) => p._id === productId);
  check("low-stock -> 200, includes our product", r.status === 200 && !!low, `found=${!!low}`);

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
  console.log(fail === 0 ? `${G}Analytics working \u2705${X}\n` : `${R}Some checks failed \u2717${X}\n`);
};

mongoose.connect(env.mongoUri).then(main)
  .catch((e) => { console.error(`${R}Test error:${X}`, e.message); fail++; })
  .finally(async () => { await mongoose.disconnect(); process.exit(fail === 0 ? 0 : 1); });

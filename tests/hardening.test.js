// Tests the correctness/hardening batch:
//  1. Refresh-token revocation (logout-all bumps tokenVersion -> old refresh fails)
//  2. Orphan pending-order cleanup (stale razorpay-pending orders auto-cancel)
//  3. Admin access to inactive products (public list hides them, admin sees them)
//  4. Email-verify checkout gate (present; enforced only when REQUIRE_VERIFIED_EMAIL=true)
//
// PREREQUISITES: MongoDB + server running (npm run dev).
// RUN: node tests/hardening.test.js

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

// api() that can send/receive cookies (needed for the refresh-token flow).
const api = async (method, path, { token, body, cookie } = {}) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = cookie;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const setCookie = res.headers.get("set-cookie");
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, setCookie };
};

const stamp = Date.now();
const password = "Passw0rd!";
const created = { products: [], categories: [], users: [], orders: [] };

const main = async () => {
  console.log(`\nTesting hardening at ${API}\n${"=".repeat(50)}`);

  // ---------- 1. Refresh-token revocation ----------
  console.log("Refresh-token revocation");
  let r = await api("POST", "/auth/login", { body: { email: `hd_${stamp}@test.com`, password } }); // will 401; register first
  r = await api("POST", "/auth/register", { body: { name: "Hd", email: `hd_${stamp}@test.com`, password } });
  const userId = r.data.user._id; created.users.push(userId);
  // login to obtain the refresh cookie
  r = await api("POST", "/auth/login", { body: { email: `hd_${stamp}@test.com`, password } });
  const accessToken = r.data.accessToken;
  const refreshCookie = (r.setCookie || "").split(";")[0]; // "refreshToken=..."
  check("login sets refresh cookie", !!refreshCookie && /=/.test(refreshCookie));

  // refresh works before revocation
  r = await api("POST", "/auth/refresh", { cookie: refreshCookie });
  check("refresh works before revoke -> 200", r.status === 200 && !!r.data.accessToken, `status ${r.status}`);

  // logout-all bumps tokenVersion
  r = await api("POST", "/auth/logout-all", { token: accessToken });
  check("logout-all -> 200", r.status === 200);

  // same refresh token now rejected
  r = await api("POST", "/auth/refresh", { cookie: refreshCookie });
  check("refresh after logout-all -> 401 (revoked)", r.status === 401, `status ${r.status}`);

  // ---------- 2. Orphan pending-order cleanup ----------
  console.log("Orphan pending-order cleanup");
  r = await api("POST", "/auth/register", { body: { name: "HdAdm", email: `hd_a_${stamp}@test.com`, password } });
  const adminId = r.data.user._id; created.users.push(adminId);
  await User.findByIdAndUpdate(adminId, { role: "admin" });
  r = await api("POST", "/auth/login", { body: { email: `hd_a_${stamp}@test.com`, password } });
  const adminToken = r.data.accessToken;
  r = await api("POST", "/auth/register", { body: { name: "HdBuy", email: `hd_b_${stamp}@test.com`, password } });
  const buyerToken = r.data.accessToken; const buyerId = r.data.user._id; created.users.push(buyerId);

  r = await api("POST", "/categories", { token: adminToken, body: { name: `HdCat ${stamp}` } });
  const categoryId = r.data._id; created.categories.push(categoryId);
  r = await api("POST", "/products", { token: adminToken, body: { name: `HdProd ${stamp}`, category: categoryId, price: 400, stock: 10 } });
  const productId = r.data._id; created.products.push(productId);

  // an online (razorpay) order stays pending until paid
  await api("POST", "/cart", { token: buyerToken, body: { productId, quantity: 1 } });
  r = await api("POST", "/orders", { token: buyerToken, body: { shippingAddress: { line1: "1 St", city: "Pune", state: "MH", postalCode: "411001" }, paymentMethod: "razorpay" } });
  const staleOrderId = r.data._id; created.orders.push(staleOrderId);
  // age it 60 minutes into the past
  await Order.findByIdAndUpdate(staleOrderId, { createdAt: new Date(Date.now() - 60 * 60 * 1000) });

  // a second, fresh pending order that should survive cleanup
  await api("POST", "/cart", { token: buyerToken, body: { productId, quantity: 1 } });
  r = await api("POST", "/orders", { token: buyerToken, body: { shippingAddress: { line1: "1 St", city: "Pune", state: "MH", postalCode: "411001" }, paymentMethod: "razorpay" } });
  const freshOrderId = r.data._id; created.orders.push(freshOrderId);

  r = await api("POST", "/orders/cleanup-pending?minutes=30", { token: buyerToken });
  check("non-admin cleanup -> 403", r.status === 403, `status ${r.status}`);

  r = await api("POST", "/orders/cleanup-pending?minutes=30", { token: adminToken });
  check("admin cleanup -> 200 (>=1 cancelled)", r.status === 200 && r.data.cancelled >= 1, JSON.stringify(r.data));

  r = await api("GET", `/orders/${staleOrderId}`, { token: buyerToken });
  check("stale order auto-cancelled", r.data.orderStatus === "cancelled", `status ${r.data.orderStatus}`);
  r = await api("GET", `/orders/${freshOrderId}`, { token: buyerToken });
  check("fresh order untouched (still pending)", r.data.orderStatus === "pending", `status ${r.data.orderStatus}`);

  // ---------- 3. Admin access to inactive products ----------
  console.log("Admin access to inactive products");
  r = await api("POST", "/products", { token: adminToken, body: { name: `HdInactive ${stamp}`, category: categoryId, price: 100, stock: 5, isActive: false } });
  const inactiveId = r.data._id; created.products.push(inactiveId);

  r = await api("GET", `/products?keyword=HdInactive ${stamp}`);
  const inPublic = Array.isArray(r.data?.products || r.data) && JSON.stringify(r.data).includes(inactiveId);
  check("public list hides inactive product", !inPublic);

  r = await api("GET", `/products/admin/all?keyword=HdInactive ${stamp}`, { token: adminToken });
  check("admin all-list includes inactive product", Array.isArray(r.data) && r.data.some((p) => p._id === inactiveId), `count ${r.data?.length}`);

  r = await api("GET", "/products/admin/all", { token: buyerToken });
  check("non-admin all-list -> 403", r.status === 403, `status ${r.status}`);

  // ---------- 4. Email-verify checkout gate ----------
  console.log("Email-verify checkout gate");
  await api("POST", "/cart", { token: buyerToken, body: { productId, quantity: 1 } });
  r = await api("POST", "/orders", { token: buyerToken, body: { shippingAddress: { line1: "1 St", city: "Pune", state: "MH", postalCode: "411001" }, paymentMethod: "cod" } });
  if (r.status === 201) created.orders.push(r.data._id);
  const gateOk = env.requireVerifiedEmail ? r.status === 403 : r.status === 201;
  check(`checkout gate behaves per REQUIRE_VERIFIED_EMAIL (${env.requireVerifiedEmail})`, gateOk, `status ${r.status}`);

  // cleanup
  const oid = (id) => new mongoose.Types.ObjectId(id);
  await Promise.all([
    User.deleteMany({ _id: { $in: created.users.map(oid) } }),
    mongoose.connection.collection("orders").deleteMany({ _id: { $in: created.orders.map(oid) } }),
    mongoose.connection.collection("carts").deleteMany({ user: { $in: created.users.map(oid) } }),
    mongoose.connection.collection("products").deleteMany({ _id: { $in: created.products.map(oid) } }),
    mongoose.connection.collection("categories").deleteMany({ _id: { $in: created.categories.map(oid) } }),
  ]);

  console.log(`\n${"=".repeat(50)}`);
  console.log(`${pass} passed, ${fail} failed`);
  console.log(fail === 0 ? `${G}Hardening working \u2705${X}` : `${R}Some checks failed \u2717${X}`);
  console.log(`${D}Email-verify gate is off by default; set REQUIRE_VERIFIED_EMAIL=true to enforce it.${X}\n`);
};

mongoose.connect(env.mongoUri).then(main)
  .catch((e) => { console.error(`${R}Test error:${X}`, e.message); fail++; })
  .finally(async () => { await mongoose.disconnect(); process.exit(fail === 0 ? 0 : 1); });

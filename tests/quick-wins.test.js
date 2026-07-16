// Coverage for endpoints that were already built but never tested:
//   - Address book (add / list / delete, default-flag behaviour)
//   - Admin user management (list / get / change role / delete + permission guards)
//   - Edge cases (out of stock, expired coupon, coupon usage limit, cancel shipped order)
//   - Product create via multipart form-data (the upload middleware path)
//
// The real Cloudinary image upload calls a live API, so it isn't run here (a
// note is printed); everything else is pure DB/logic and runs fully offline.
//
// PREREQUISITES: MongoDB running + server running (npm run dev).
// RUN:           node tests/quick-wins.test.js

require("dotenv").config();
const mongoose = require("mongoose");
const env = require("../config/env");
const User = require("../models/user.model");
const Coupon = require("../models/coupon.model");

const ROOT = process.env.TEST_URL || `http://localhost:${env.port}`;
const API = `${ROOT}/api`;

let pass = 0, fail = 0;
const G = "\x1b[32m", R = "\x1b[31m", D = "\x1b[2m", X = "\x1b[0m";
const check = (name, ok, extra) => {
  if (ok) { pass++; console.log(`  ${G}\u2713${X} ${name}`); }
  else { fail++; console.log(`  ${R}\u2717${X} ${name}${extra ? `  ${D}(${extra})${X}` : ""}`); }
};
const section = (t) => console.log(`\n${t}`);

// JSON helper
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

// multipart/form-data helper (fetch sets the Content-Type + boundary itself)
const apiForm = async (method, path, { token, fields = {} } = {}) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, String(v));
  const res = await fetch(`${API}${path}`, { method, headers, body: form });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
};

const stamp = Date.now();
const password = "Passw0rd!";
const created = { products: [], categories: [], coupons: [], orders: [], users: [] };

const main = async () => {
  console.log(`\nTesting quick-wins at ${API}\n${"=".repeat(50)}`);

  // ---- setup: customer + admin ----
  let r = await api("POST", "/auth/register", { body: { name: "QW Cust", email: `qw_c_${stamp}@test.com`, password } });
  const custToken = r.data.accessToken;
  const custId = r.data.user?._id;
  created.users.push(custId);

  r = await api("POST", "/auth/register", { body: { name: "QW Adm", email: `qw_a_${stamp}@test.com`, password } });
  const adminId = r.data.user?._id;
  created.users.push(adminId);
  await User.findByIdAndUpdate(adminId, { role: "admin" });
  r = await api("POST", "/auth/login", { body: { email: `qw_a_${stamp}@test.com`, password } });
  const adminToken = r.data.accessToken;

  // ---------- Address book ----------
  section("Address book");
  const addr1 = { line1: "1 A St", city: "Pune", state: "MH", postalCode: "411001", isDefault: true };
  r = await api("POST", "/users/me/addresses", { token: custToken, body: addr1 });
  check("add address -> 201", r.status === 201 && Array.isArray(r.data) && r.data.length === 1, `status ${r.status}`);
  check("first address is default", r.data[0]?.isDefault === true);
  const firstAddrId = r.data[0]?._id;

  r = await api("POST", "/users/me/addresses", {
    token: custToken,
    body: { line1: "2 B St", city: "Mumbai", state: "MH", postalCode: "400001", isDefault: true },
  });
  check("add second default address -> 201 (2 total)", r.status === 201 && r.data.length === 2);
  const stillDefaultCount = r.data.filter((a) => a.isDefault).length;
  check("only one address stays default", stillDefaultCount === 1);

  r = await api("GET", "/users/me/addresses", { token: custToken });
  check("list addresses -> 200 (2)", r.status === 200 && r.data.length === 2);

  r = await api("DELETE", `/users/me/addresses/${firstAddrId}`, { token: custToken });
  check("delete address -> 200 (1 left)", r.status === 200 && r.data.length === 1);

  r = await api("DELETE", `/users/me/addresses/${new mongoose.Types.ObjectId()}`, { token: custToken });
  check("delete non-existent address -> 404", r.status === 404);

  // ---------- Admin user management ----------
  section("Admin user management");
  r = await api("GET", "/users", { token: custToken });
  check("customer lists users -> 403", r.status === 403);

  r = await api("GET", "/users", { token: adminToken });
  check("admin lists users -> 200 array", r.status === 200 && Array.isArray(r.data));

  r = await api("GET", `/users/${custId}`, { token: adminToken });
  check("admin gets one user -> 200", r.status === 200 && r.data.email === `qw_c_${stamp}@test.com`);

  r = await api("PUT", `/users/${custId}/role`, { token: adminToken, body: { role: "designer" } });
  check("admin changes role -> 200 (designer)", r.status === 200 && r.data.role === "designer");

  r = await api("PUT", `/users/${custId}/role`, { token: adminToken, body: { role: "banana" } });
  check("invalid role -> 400", r.status === 400);

  r = await api("PUT", `/users/${custId}/role`, { token: custToken, body: { role: "admin" } });
  check("customer changes role -> 403", r.status === 403);
  // put the customer's role back so later customer actions still work
  await User.findByIdAndUpdate(custId, { role: "customer" });

  // create + delete a throwaway user
  r = await api("POST", "/auth/register", { body: { name: "Temp", email: `qw_t_${stamp}@test.com`, password } });
  const tempId = r.data.user?._id;
  r = await api("DELETE", `/users/${tempId}`, { token: adminToken });
  check("admin deletes user -> 200", r.status === 200);
  r = await api("GET", `/users/${tempId}`, { token: adminToken });
  check("deleted user now 404", r.status === 404);

  // ---------- Edge cases ----------
  section("Edge cases");
  // product with stock 1
  r = await api("POST", "/categories", { token: adminToken, body: { name: `QWCat ${stamp}` } });
  const categoryId = r.data._id;
  created.categories.push(categoryId);
  r = await api("POST", "/products", { token: adminToken, body: { name: `QWProd ${stamp}`, category: categoryId, price: 300, stock: 1 } });
  const productId = r.data._id;
  created.products.push(productId);

  r = await api("POST", "/cart", { token: custToken, body: { productId, quantity: 5 } });
  check("add more than stock -> 400 not enough stock", r.status === 400, `status ${r.status}`);

  r = await api("POST", "/cart", { token: custToken, body: { productId, quantity: 1 } });
  check("add within stock -> 200", r.status === 200);

  // expired coupon
  r = await api("POST", "/coupons", {
    token: adminToken,
    body: { code: `EXP${stamp}`, type: "percentage", value: 10, expiresAt: new Date(Date.now() - 60000) },
  });
  created.coupons.push(r.data._id);
  r = await api("POST", "/cart/coupon", { token: custToken, body: { code: `EXP${stamp}` } });
  check("expired coupon -> 400", r.status === 400 && /expired/i.test(r.data.message), r.data.message);

  // usage-limit coupon
  r = await api("POST", "/coupons", {
    token: adminToken,
    body: { code: `LIM${stamp}`, type: "percentage", value: 10, usageLimit: 1 },
  });
  const limCouponId = r.data._id;
  created.coupons.push(limCouponId);
  await Coupon.findByIdAndUpdate(limCouponId, { usedCount: 1 }); // pretend it's been used up
  r = await api("POST", "/cart/coupon", { token: custToken, body: { code: `LIM${stamp}` } });
  check("coupon usage limit reached -> 400", r.status === 400 && /limit/i.test(r.data.message), r.data.message);

  // cancel a shipped order -> not allowed
  r = await api("POST", "/orders", {
    token: custToken,
    body: { shippingAddress: { line1: "1 St", city: "Pune", state: "MH", postalCode: "411001" }, paymentMethod: "cod" },
  });
  const orderId = r.data._id;
  created.orders.push(orderId);
  check("order created for cancel test -> 201", r.status === 201, `status ${r.status}`);

  r = await api("PUT", `/orders/${orderId}/status`, { token: adminToken, body: { status: "shipped" } });
  check("admin marks order shipped -> 200", r.status === 200 && r.data.orderStatus === "shipped");

  r = await api("PUT", `/orders/${orderId}/cancel`, { token: custToken });
  check("cancel shipped order -> 400 (not allowed)", r.status === 400, `status ${r.status}`);

  // ---------- Product create via multipart (upload middleware path) ----------
  section("Product create via multipart form-data");
  r = await apiForm("POST", "/products", {
    token: adminToken,
    fields: { name: `FormProd ${stamp}`, category: categoryId, price: 150, stock: 3 },
  });
  check("multipart create (no file) -> 201", r.status === 201, `status ${r.status}`);
  if (r.data?._id) created.products.push(r.data._id);

  r = await apiForm("POST", "/products", {
    token: adminToken,
    fields: { name: "MissingFields" }, // no category/price
  });
  check("multipart missing fields -> 400 validation", r.status === 400);

  // ---------- cleanup ----------
  const oid = (id) => new mongoose.Types.ObjectId(id);
  await Promise.all([
    User.deleteMany({ _id: { $in: [custId, adminId, tempId].filter(Boolean) } }),
    Coupon.deleteMany({ _id: { $in: created.coupons.map(oid) } }),
    mongoose.connection.collection("orders").deleteMany({ _id: { $in: created.orders.map(oid) } }),
    mongoose.connection.collection("products").deleteMany({ _id: { $in: created.products.map(oid) } }),
    mongoose.connection.collection("categories").deleteMany({ _id: { $in: created.categories.map(oid) } }),
    mongoose.connection.collection("carts").deleteMany({ user: { $in: [custId, adminId].map(oid) } }),
  ]);

  console.log(`\n${"=".repeat(50)}`);
  console.log(`${pass} passed, ${fail} failed`);
  console.log(fail === 0 ? `${G}Quick-wins covered \u2705${X}` : `${R}Some checks failed \u2717${X}`);
  console.log(`${D}Note: live Cloudinary image upload needs CLOUDINARY_* keys - test that manually.${X}\n`);
};

mongoose
  .connect(env.mongoUri)
  .then(main)
  .catch((err) => { console.error(`${R}Test error:${X}`, err.message); fail++; })
  .finally(async () => { await mongoose.disconnect(); process.exit(fail === 0 ? 0 : 1); });
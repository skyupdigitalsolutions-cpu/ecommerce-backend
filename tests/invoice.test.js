// Tests the order invoice PDF endpoint: owner and admin can download a valid
// PDF; a different customer cannot (403).
//
// PREREQUISITES: MongoDB + server running (npm run dev).
// RUN: node tests/invoice.test.js

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

const getPdf = async (path, token) => {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const ct = res.headers.get("content-type") || "";
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, ct, head: buf.slice(0, 5).toString("latin1"), size: buf.length };
};

const stamp = Date.now();
const password = "Passw0rd!";
const created = { products: [], categories: [], users: [], orders: [] };

const main = async () => {
  console.log(`\nTesting invoices at ${API}\n${"=".repeat(50)}`);

  let r = await api("POST", "/auth/register", { body: { name: "InvCust", email: `iv_c_${stamp}@test.com`, password } });
  const custToken = r.data.accessToken; const custId = r.data.user._id; created.users.push(custId);
  r = await api("POST", "/auth/register", { body: { name: "InvOther", email: `iv_o_${stamp}@test.com`, password } });
  const otherToken = r.data.accessToken; created.users.push(r.data.user._id);
  r = await api("POST", "/auth/register", { body: { name: "InvAdm", email: `iv_a_${stamp}@test.com`, password } });
  const adminId = r.data.user._id; created.users.push(adminId);
  await User.findByIdAndUpdate(adminId, { role: "admin" });
  r = await api("POST", "/auth/login", { body: { email: `iv_a_${stamp}@test.com`, password } });
  const adminToken = r.data.accessToken;

  r = await api("POST", "/categories", { token: adminToken, body: { name: `InvCat ${stamp}` } });
  const categoryId = r.data._id; created.categories.push(categoryId);
  r = await api("POST", "/products", { token: adminToken, body: { name: `InvProd ${stamp}`, category: categoryId, price: 350, stock: 10 } });
  const productId = r.data._id; created.products.push(productId);

  await api("POST", "/cart", { token: custToken, body: { productId, quantity: 2 } });
  r = await api("POST", "/orders", { token: custToken, body: { shippingAddress: { line1: "12 MG Rd", city: "Pune", state: "MH", postalCode: "411001", phone: "9999999999" }, paymentMethod: "cod" } });
  const orderId = r.data._id; created.orders.push(orderId);

  // owner downloads a valid PDF
  let p = await getPdf(`/orders/${orderId}/invoice`, custToken);
  check("owner invoice -> 200 application/pdf", p.status === 200 && p.ct.includes("application/pdf"), `status ${p.status} ct ${p.ct}`);
  check("body is a real PDF (%PDF)", p.head.startsWith("%PDF"), p.head);
  check("pdf is non-trivial size", p.size > 800, `size ${p.size}`);

  // admin can also download
  p = await getPdf(`/orders/${orderId}/invoice`, adminToken);
  check("admin invoice -> 200 pdf", p.status === 200 && p.head.startsWith("%PDF"));

  // another customer cannot
  const other = await api("GET", `/orders/${orderId}/invoice`, { token: otherToken });
  check("other customer invoice -> 403", other.status === 403, `status ${other.status}`);

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
  console.log(fail === 0 ? `${G}Invoices working \u2705${X}\n` : `${R}Some checks failed \u2717${X}\n`);
};

mongoose.connect(env.mongoUri).then(main)
  .catch((e) => { console.error(`${R}Test error:${X}`, e.message); fail++; })
  .finally(async () => { await mongoose.disconnect(); process.exit(fail === 0 ? 0 : 1); });

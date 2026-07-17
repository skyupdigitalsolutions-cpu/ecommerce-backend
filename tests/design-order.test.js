// Verifies customizable products require a design, and that a design flows
// from cart into the order snapshot.
// PREREQUISITES: MongoDB + server running (npm run dev).
// RUN: node tests/design-order.test.js

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
  console.log(`\nTesting design->order at ${API}\n${"=".repeat(50)}`);

  // customer
  let r = await api("POST", "/auth/register", { body: { name: "DO Cust", email: `do_c_${stamp}@test.com`, password } });
  const custToken = r.data.accessToken;
  const custId = r.data.user._id;
  created.users.push(custId);

  // admin
  r = await api("POST", "/auth/register", { body: { name: "DO Adm", email: `do_a_${stamp}@test.com`, password } });
  const adminId = r.data.user._id;
  created.users.push(adminId);
  await User.findByIdAndUpdate(adminId, { role: "admin" });
  r = await api("POST", "/auth/login", { body: { email: `do_a_${stamp}@test.com`, password } });
  const adminToken = r.data.accessToken;

  // customizable product
  r = await api("POST", "/categories", { token: adminToken, body: { name: `DOCat ${stamp}` } });
  const categoryId = r.data._id;
  created.categories.push(categoryId);
  r = await api("POST", "/products", {
    token: adminToken,
    body: { name: `Custom Card ${stamp}`, category: categoryId, price: 400, stock: 50, customizable: true },
  });
  const productId = r.data._id;
  created.products.push(productId);
  check("product created as customizable", r.status === 201 && r.data.customizable === true, `status ${r.status}`);

  // add customizable product WITHOUT a design -> 400
  r = await api("POST", "/cart", { token: custToken, body: { productId, quantity: 1 } });
  check("add customizable w/o design -> 400", r.status === 400 && /design/i.test(r.data.message), r.data.message);

  // create a design for this product
  r = await api("POST", "/designs", {
    token: custToken,
    body: { name: "My card design", product: productId, canvas: { objects: [] }, thumbnail: "data:image/png;base64,AAAA" },
  });
  const designId = r.data._id;
  check("design created", r.status === 201 && !!designId);

  // add WITH design -> 200, and the cart line carries the design
  r = await api("POST", "/cart", { token: custToken, body: { productId, quantity: 2, designId } });
  const line = r.data.cart?.items?.find((i) => i.product?._id === productId);
  check("add customizable w/ design -> 200", r.status === 200, `status ${r.status}`);
  check("cart line carries the design", line?.design?._id === designId || line?.design === designId, JSON.stringify(line?.design));

  // someone else's design is rejected
  r = await api("POST", "/auth/register", { body: { name: "Other", email: `do_o_${stamp}@test.com`, password } });
  const otherToken = r.data.accessToken;
  created.users.push(r.data.user._id);
  r = await api("POST", "/cart", { token: otherToken, body: { productId, quantity: 1, designId } });
  check("using another user's design -> 403", r.status === 403, `status ${r.status}`);

  // checkout -> order item snapshots the design + thumbnail
  r = await api("POST", "/orders", {
    token: custToken,
    body: { shippingAddress: { line1: "1 St", city: "Pune", state: "MH", postalCode: "411001" }, paymentMethod: "cod" },
  });
  const order = r.data;
  created.orders.push(order?._id);
  check("checkout -> 201", r.status === 201, `status ${r.status}`);
  const oi = order?.items?.[0];
  check("order item carries design id", (oi?.design === designId) || (oi?.design?.toString?.() === designId), JSON.stringify(oi?.design));
  check("order item carries design thumbnail", typeof oi?.designThumbnail === "string" && oi.designThumbnail.length > 0);

  // cleanup
  const oid = (id) => new mongoose.Types.ObjectId(id);
  await Promise.all([
    User.deleteMany({ _id: { $in: created.users.map(oid) } }),
    mongoose.connection.collection("designs").deleteMany({ user: oid(custId) }),
    mongoose.connection.collection("orders").deleteMany({ _id: { $in: created.orders.filter(Boolean).map(oid) } }),
    mongoose.connection.collection("products").deleteMany({ _id: { $in: created.products.map(oid) } }),
    mongoose.connection.collection("categories").deleteMany({ _id: { $in: created.categories.map(oid) } }),
    mongoose.connection.collection("carts").deleteMany({ user: oid(custId) }),
  ]);

  console.log(`\n${"=".repeat(50)}`);
  console.log(`${pass} passed, ${fail} failed`);
  console.log(fail === 0 ? `${G}Design->order wiring working \u2705${X}\n` : `${R}Some checks failed \u2717${X}\n`);
};

mongoose.connect(env.mongoUri).then(main)
  .catch((e) => { console.error(`${R}Test error:${X}`, e.message); fail++; })
  .finally(async () => { await mongoose.disconnect(); process.exit(fail === 0 ? 0 : 1); });

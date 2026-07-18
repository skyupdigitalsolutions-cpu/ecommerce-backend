// Tests real-time order updates over Socket.io: a connected client receives an
// `order:update` event (scoped to its own user room) when an admin changes the
// order's status, and does NOT receive another user's events.
//
// PREREQUISITES: MongoDB + server running (npm run dev), and socket.io-client
//   installed (npm install --save-dev socket.io-client).
// RUN: node tests/realtime.test.js

require("dotenv").config();
const mongoose = require("mongoose");
const { io: ioClient } = require("socket.io-client");
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

const connect = (token) =>
  new Promise((resolve, reject) => {
    const socket = ioClient(ROOT, { auth: { token }, transports: ["websocket"], reconnection: false });
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", (e) => reject(e));
    setTimeout(() => reject(new Error("connect timeout")), 5000);
  });

const nextEvent = (socket, event, timeoutMs = 6000) =>
  new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), timeoutMs);
    socket.once(event, (data) => { clearTimeout(t); resolve(data); });
  });

const stamp = Date.now();
const password = "Passw0rd!";
const created = { products: [], categories: [], users: [], orders: [] };
let sockA, sockB;

const main = async () => {
  console.log(`\nTesting real-time updates at ${ROOT}\n${"=".repeat(50)}`);

  // customer A (owns the order), customer B (should NOT receive A's events), admin
  let r = await api("POST", "/auth/register", { body: { name: "RtA", email: `rt_a_${stamp}@test.com`, password } });
  const tokenA = r.data.accessToken; const userA = r.data.user._id; created.users.push(userA);
  r = await api("POST", "/auth/register", { body: { name: "RtB", email: `rt_b_${stamp}@test.com`, password } });
  const tokenB = r.data.accessToken; created.users.push(r.data.user._id);
  r = await api("POST", "/auth/register", { body: { name: "RtAdm", email: `rt_adm_${stamp}@test.com`, password } });
  const adminId = r.data.user._id; created.users.push(adminId);
  await User.findByIdAndUpdate(adminId, { role: "admin" });
  r = await api("POST", "/auth/login", { body: { email: `rt_adm_${stamp}@test.com`, password } });
  const adminToken = r.data.accessToken;

  // product + order owned by A
  r = await api("POST", "/categories", { token: adminToken, body: { name: `RtCat ${stamp}` } });
  const categoryId = r.data._id; created.categories.push(categoryId);
  r = await api("POST", "/products", { token: adminToken, body: { name: `RtProd ${stamp}`, category: categoryId, price: 300, stock: 10 } });
  const productId = r.data._id; created.products.push(productId);
  await api("POST", "/cart", { token: tokenA, body: { productId, quantity: 1 } });
  r = await api("POST", "/orders", { token: tokenA, body: { shippingAddress: { line1: "1 St", city: "Pune", state: "MH", postalCode: "411001" }, paymentMethod: "cod" } });
  const orderId = r.data._id; created.orders.push(orderId);

  // reject connection without a token
  let unauth = false;
  try { await connect(undefined); } catch { unauth = true; }
  check("socket without token rejected", unauth);

  // connect both customers
  sockA = await connect(tokenA);
  sockB = await connect(tokenB);
  check("customer A socket connected", sockA.connected);
  check("customer B socket connected", sockB.connected);

  // arm listeners, THEN trigger the status change
  const gotA = nextEvent(sockA, "order:update");
  const gotB = nextEvent(sockB, "order:update", 2500);
  await api("PUT", `/orders/${orderId}/status`, { token: adminToken, body: { status: "shipped" } });

  const evtA = await gotA;
  check("owner receives order:update", !!evtA && String(evtA.orderId) === String(orderId) && evtA.orderStatus === "shipped", JSON.stringify(evtA));

  const evtB = await gotB;
  check("other user does NOT receive it", evtB === null, JSON.stringify(evtB));

  // cleanup
  sockA?.disconnect();
  sockB?.disconnect();
  const oid = (id) => new mongoose.Types.ObjectId(id);
  await Promise.all([
    User.deleteMany({ _id: { $in: created.users.map(oid) } }),
    mongoose.connection.collection("orders").deleteMany({ _id: { $in: created.orders.map(oid) } }),
    mongoose.connection.collection("carts").deleteMany({ user: oid(userA) }),
    mongoose.connection.collection("products").deleteMany({ _id: { $in: created.products.map(oid) } }),
    mongoose.connection.collection("categories").deleteMany({ _id: { $in: created.categories.map(oid) } }),
  ]);

  console.log(`\n${"=".repeat(50)}`);
  console.log(`${pass} passed, ${fail} failed`);
  console.log(fail === 0 ? `${G}Real-time notifications working \u2705${X}\n` : `${R}Some checks failed \u2717${X}\n`);
};

mongoose.connect(env.mongoUri).then(main)
  .catch((e) => { console.error(`${R}Test error:${X}`, e.message); fail++; })
  .finally(async () => { try { sockA?.disconnect(); sockB?.disconnect(); } catch {} await mongoose.disconnect(); process.exit(fail === 0 ? 0 : 1); });

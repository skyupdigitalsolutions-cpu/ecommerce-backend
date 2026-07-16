// End-to-end smoke test for the whole backend.
//
// It exercises the full journey over real HTTP against your running server:
//   auth -> admin catalog -> permissions -> cart -> coupon -> wishlist ->
//   order -> status update -> cancel + stock restore -> cleanup.
//
// PREREQUISITES:
//   1. MongoDB running
//   2. The API running in another terminal:  npm run dev
//
// RUN:
//   node tests/e2e.test.js

require("dotenv").config();
const mongoose = require("mongoose");
const env = require("../config/env");
const User = require("../models/user.model");

const ROOT = process.env.TEST_URL || `http://localhost:${env.port}`;
const API = `${ROOT}/api`;

// ---- tiny test harness (no framework needed) ----
let pass = 0;
let fail = 0;
const G = "\x1b[32m", R = "\x1b[31m", D = "\x1b[2m", X = "\x1b[0m";

const check = (name, ok, extra) => {
  if (ok) {
    pass++;
    console.log(`  ${G}✓${X} ${name}`);
  } else {
    fail++;
    console.log(`  ${R}✗${X} ${name}${extra ? `  ${D}(${extra})${X}` : ""}`);
  }
};

const section = (title) => console.log(`\n${title}`);

// ---- HTTP helper ----
const api = async (method, path, { token, body, cookie } = {}) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = cookie;
  if (body) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data, setCookies: res.headers.getSetCookie?.() || [] };
};

// Pull the refreshToken value out of a Set-Cookie header array.
const extractRefreshCookie = (setCookies) => {
  const c = setCookies.find((s) => s.startsWith("refreshToken="));
  return c ? c.split(";")[0] : null;
};

const stamp = Date.now();

const main = async () => {
  console.log(`\nTesting API at ${API}\n${"=".repeat(50)}`);

  // ---------- 0. Server reachable ----------
  section("0) Server health");
  try {
    const r = await fetch(ROOT);
    check("GET / responds 200", r.status === 200);
  } catch (e) {
    console.log(`\n${R}Cannot reach the server at ${ROOT}.${X}`);
    console.log(`Start it first:  npm run dev\n`);
    process.exit(1);
  }

  // ---------- 1. Customer auth ----------
  section("1) Customer authentication");
  const customerEmail = `customer_${stamp}@test.com`;
  const password = "Passw0rd!";

  let r = await api("POST", "/auth/register", {
    body: { name: "Test Customer", email: customerEmail, password, phone: "9999999999" },
  });
  check("register -> 201 + accessToken", r.status === 201 && !!r.data.accessToken, `status ${r.status}`);

  r = await api("POST", "/auth/register", { body: { email: "bad" } });
  check("register bad body -> 400 validation", r.status === 400);

  r = await api("POST", "/auth/login", { body: { email: customerEmail, password } });
  check("login -> 200 + accessToken", r.status === 200 && !!r.data.accessToken, `status ${r.status}`);
  const customerToken = r.data.accessToken;
  const refreshCookie = extractRefreshCookie(r.setCookies);
  check("login sets refresh cookie", !!refreshCookie);

  r = await api("POST", "/auth/login", { body: { email: customerEmail, password: "wrong" } });
  check("login wrong password -> 401", r.status === 401);

  r = await api("GET", "/auth/me", { token: customerToken });
  check("GET /auth/me -> 200, role customer", r.status === 200 && r.data.user?.role === "customer");

  r = await api("GET", "/auth/me");
  check("GET /auth/me no token -> 401", r.status === 401);

  if (refreshCookie) {
    r = await api("POST", "/auth/refresh", { cookie: refreshCookie });
    check("POST /auth/refresh -> 200 + new accessToken", r.status === 200 && !!r.data.accessToken);
  }

  // ---------- 2. Admin bootstrap ----------
  section("2) Admin bootstrap");
  const adminEmail = `admin_${stamp}@test.com`;
  r = await api("POST", "/auth/register", {
    body: { name: "Test Admin", email: adminEmail, password },
  });
  const adminId = r.data.user?._id;
  check("register admin user -> 201", r.status === 201);

  // Promote to admin directly in the DB (there is no public "make me admin" route).
  await User.findByIdAndUpdate(adminId, { role: "admin" });
  check("promote user to admin (via DB)", true);

  r = await api("POST", "/auth/login", { body: { email: adminEmail, password } });
  const adminToken = r.data.accessToken;
  check("admin login -> 200", r.status === 200 && !!adminToken);

  // ---------- 3. Permissions ----------
  section("3) Role-based permissions");
  r = await api("POST", "/categories", { token: customerToken, body: { name: "Nope" } });
  check("customer creates category -> 403 forbidden", r.status === 403);

  r = await api("GET", "/coupons", { token: customerToken });
  check("customer lists coupons -> 403 forbidden", r.status === 403);

  // ---------- 4. Catalog (admin) ----------
  section("4) Category + Product (admin)");
  r = await api("POST", "/categories", {
    token: adminToken,
    body: { name: `Cat ${stamp}`, description: "test category" },
  });
  const categoryId = r.data._id;
  check("create category -> 201 (+slug)", r.status === 201 && !!r.data.slug, `status ${r.status}`);

  r = await api("GET", "/categories");
  check("GET /categories (public) -> 200 array", r.status === 200 && Array.isArray(r.data));

  r = await api("POST", "/products", {
    token: adminToken,
    body: { name: `Prod ${stamp}`, category: categoryId, price: 500, stock: 50, description: "test" },
  });
  const productId = r.data._id;
  check("create product -> 201", r.status === 201 && !!productId, `status ${r.status}`);

  r = await api("POST", "/products", { token: adminToken, body: { name: "no price" } });
  check("create product missing fields -> 400 validation", r.status === 400);

  r = await api("GET", `/products/${productId}`);
  check("GET /products/:id (public) -> 200", r.status === 200 && r.data.stock === 50);

  r = await api("GET", "/products?keyword=Prod&page=1&limit=5");
  check("GET /products with filters -> 200 paginated", r.status === 200 && Array.isArray(r.data.products) && "pages" in r.data);

  // ---------- 5. Coupon (admin) ----------
  section("5) Coupon (admin)");
  const couponCode = `SAVE10_${stamp}`;
  r = await api("POST", "/coupons", {
    token: adminToken,
    body: { code: couponCode, type: "percentage", value: 10, minOrderAmount: 0 },
  });
  const couponId = r.data._id;
  check("create coupon -> 201", r.status === 201 && !!couponId);

  // ---------- 6. Cart + coupon (customer) ----------
  section("6) Cart + coupon (customer)");
  r = await api("POST", "/cart", { token: customerToken, body: { productId, quantity: 2 } });
  check("add to cart -> 200 + totals", r.status === 200 && r.data.totals?.itemsPrice === 1000, `items=${r.data.totals?.itemsPrice}`);

  r = await api("PUT", `/cart/${productId}`, { token: customerToken, body: { quantity: 3 } });
  check("update qty to 3 -> itemsPrice 1500", r.status === 200 && r.data.totals?.itemsPrice === 1500, `items=${r.data.totals?.itemsPrice}`);

  r = await api("POST", "/cart/coupon", { token: customerToken, body: { code: couponCode } });
  check("apply 10% coupon -> discount 150", r.status === 200 && r.data.totals?.discountPrice === 150, `disc=${r.data.totals?.discountPrice}`);

  r = await api("GET", "/cart", { token: customerToken });
  check("GET /cart -> 200 with 1 item", r.status === 200 && r.data.cart?.items?.length === 1);

  // ---------- 7. Wishlist ----------
  section("7) Wishlist");
  r = await api("POST", "/wishlist", { token: customerToken, body: { productId } });
  check("add to wishlist -> 200", r.status === 200 && r.data.products?.length === 1);

  r = await api("GET", "/wishlist", { token: customerToken });
  check("GET /wishlist -> 200", r.status === 200);

  // ---------- 8. Order ----------
  section("8) Order lifecycle");
  r = await api("POST", "/orders", {
    token: customerToken,
    body: {
      shippingAddress: { line1: "1 Test St", city: "Pune", state: "MH", postalCode: "411001", phone: "9999999999" },
      paymentMethod: "cod",
    },
  });
  const orderId = r.data._id;
  check("create order from cart -> 201", r.status === 201 && !!orderId, `status ${r.status}`);
  check("order total computed on server", r.data.totalPrice > 0, `total=${r.data.totalPrice}`);
  check("order discount carried over (150)", r.data.discountPrice === 150, `disc=${r.data.discountPrice}`);

  r = await api("GET", `/products/${productId}`);
  check("stock decremented 50 -> 47", r.status === 200 && r.data.stock === 47, `stock=${r.data.stock}`);

  r = await api("GET", "/orders/my", { token: customerToken });
  check("GET /orders/my -> 200 includes order", r.status === 200 && r.data.some((o) => o._id === orderId));

  r = await api("GET", "/orders", { token: customerToken });
  check("customer GET /orders (admin only) -> 403", r.status === 403);

  r = await api("GET", "/orders", { token: adminToken });
  check("admin GET /orders -> 200", r.status === 200 && Array.isArray(r.data));

  r = await api("PUT", `/orders/${orderId}/status`, { token: adminToken, body: { status: "confirmed" } });
  check("admin set status confirmed -> 200", r.status === 200 && r.data.orderStatus === "confirmed");

  r = await api("PUT", `/orders/${orderId}/cancel`, { token: customerToken });
  check("customer cancels order -> 200 cancelled", r.status === 200 && r.data.orderStatus === "cancelled");

  r = await api("GET", `/products/${productId}`);
  check("stock restored 47 -> 50 after cancel", r.status === 200 && r.data.stock === 50, `stock=${r.data.stock}`);

  // ---------- 9. Cleanup ----------
  section("9) Cleanup (also tests DELETE routes)");
  r = await api("DELETE", `/products/${productId}`, { token: adminToken });
  check("delete product -> 200", r.status === 200);

  r = await api("DELETE", `/coupons/${couponId}`, { token: adminToken });
  check("delete coupon -> 200", r.status === 200);

  r = await api("DELETE", `/categories/${categoryId}`, { token: adminToken });
  check("delete category -> 200", r.status === 200);

  // Remove the two test users + their cart/wishlist/order directly.
  const ids = (await User.find({ email: { $in: [customerEmail, adminEmail] } })).map((u) => u._id);
  await Promise.all([
    User.deleteMany({ _id: { $in: ids } }),
    mongoose.connection.collection("carts").deleteMany({ user: { $in: ids } }),
    mongoose.connection.collection("wishlists").deleteMany({ user: { $in: ids } }),
    mongoose.connection.collection("orders").deleteMany({ user: { $in: ids } }),
  ]);
  check("removed test users + their data", true);

  // ---------- summary ----------
  console.log(`\n${"=".repeat(50)}`);
  console.log(`${pass} passed, ${fail} failed`);
  console.log(fail === 0 ? `${G}Backend is working ✅${X}\n` : `${R}Some checks failed ✗${X}\n`);
};

// Connect to Mongo (needed for admin bootstrap + cleanup), run, then disconnect.
mongoose
  .connect(env.mongoUri)
  .then(main)
  .catch((err) => {
    console.error(`${R}Test run error:${X}`, err.message);
    fail++;
  })
  .finally(async () => {
    await mongoose.disconnect();
    process.exit(fail === 0 ? 0 : 1);
  });
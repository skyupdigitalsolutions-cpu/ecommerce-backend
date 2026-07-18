// Test for reviews & ratings: CRUD, ownership, duplicate prevention, and that
// the product's ratingsAverage / ratingsCount stay in sync.
// PREREQUISITES: MongoDB + server running (npm run dev).
// RUN: node tests/review.test.js

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

const productRating = async (token, productId) => {
  const r = await api("GET", `/products/${productId}`, { token });
  return { avg: r.data.ratingsAverage, count: r.data.ratingsCount };
};

const stamp = Date.now();
const password = "Passw0rd!";
const created = { products: [], categories: [], users: [] };

const main = async () => {
  console.log(`\nTesting reviews at ${API}\n${"=".repeat(50)}`);

  // two customers + an admin
  let r = await api("POST", "/auth/register", { body: { name: "Rev1", email: `rv1_${stamp}@test.com`, password } });
  const t1 = r.data.accessToken; const u1 = r.data.user._id; created.users.push(u1);
  r = await api("POST", "/auth/register", { body: { name: "Rev2", email: `rv2_${stamp}@test.com`, password } });
  const t2 = r.data.accessToken; const u2 = r.data.user._id; created.users.push(u2);
  r = await api("POST", "/auth/register", { body: { name: "RevAdm", email: `rva_${stamp}@test.com`, password } });
  const adminId = r.data.user._id; created.users.push(adminId);
  await User.findByIdAndUpdate(adminId, { role: "admin" });
  r = await api("POST", "/auth/login", { body: { email: `rva_${stamp}@test.com`, password } });
  const adminToken = r.data.accessToken;

  // product to review
  r = await api("POST", "/categories", { token: adminToken, body: { name: `RevCat ${stamp}` } });
  const categoryId = r.data._id; created.categories.push(categoryId);
  r = await api("POST", "/products", { token: adminToken, body: { name: `RevProd ${stamp}`, category: categoryId, price: 200, stock: 20 } });
  const productId = r.data._id; created.products.push(productId);

  // create review (user1, rating 4)
  r = await api("POST", "/reviews", { token: t1, body: { productId, rating: 4, comment: "Nice" } });
  const review1Id = r.data._id;
  check("create review -> 201", r.status === 201 && !!review1Id, `status ${r.status}`);
  let pr = await productRating(t1, productId);
  check("product rating 4.0 / count 1", pr.avg === 4 && pr.count === 1, `avg=${pr.avg} count=${pr.count}`);

  // duplicate review by same user -> 400
  r = await api("POST", "/reviews", { token: t1, body: { productId, rating: 3 } });
  check("duplicate review -> 400", r.status === 400, `status ${r.status}`);

  // invalid rating -> 400
  r = await api("POST", "/reviews", { token: t2, body: { productId, rating: 6 } });
  check("rating out of range -> 400", r.status === 400, `status ${r.status}`);

  // second user reviews (rating 2) -> avg 3.0, count 2
  r = await api("POST", "/reviews", { token: t2, body: { productId, rating: 2, comment: "Meh" } });
  check("second user review -> 201", r.status === 201);
  pr = await productRating(t1, productId);
  check("product rating 3.0 / count 2", pr.avg === 3 && pr.count === 2, `avg=${pr.avg} count=${pr.count}`);

  // public list (no token)
  r = await api("GET", `/reviews/product/${productId}`);
  check("public list reviews -> 200 (2)", r.status === 200 && r.data.length === 2, `status ${r.status} len ${r.data?.length}`);
  check("list populates reviewer name", !!r.data[0]?.user?.name);

  // my reviews
  r = await api("GET", "/reviews/my", { token: t1 });
  check("my reviews -> 200 (1)", r.status === 200 && r.data.length === 1);

  // update own review 4 -> 5, avg (5+2)/2 = 3.5
  r = await api("PUT", `/reviews/${review1Id}`, { token: t1, body: { rating: 5 } });
  check("update own review -> 200", r.status === 200 && r.data.rating === 5);
  pr = await productRating(t1, productId);
  check("product rating 3.5 after update", pr.avg === 3.5, `avg=${pr.avg}`);

  // cannot update someone else's review
  r = await api("PUT", `/reviews/${review1Id}`, { token: t2, body: { rating: 1 } });
  check("update other's review -> 403", r.status === 403);

  // cannot delete someone else's review (non-admin)
  r = await api("DELETE", `/reviews/${review1Id}`, { token: t2 });
  check("delete other's review (non-admin) -> 403", r.status === 403);

  // admin can delete any review; avg becomes 2.0 / count 1
  r = await api("DELETE", `/reviews/${review1Id}`, { token: adminToken });
  check("admin deletes review -> 200", r.status === 200);
  pr = await productRating(t1, productId);
  check("product rating 2.0 / count 1 after delete", pr.avg === 2 && pr.count === 1, `avg=${pr.avg} count=${pr.count}`);

  // owner deletes own; avg resets to 0 / count 0
  r = await api("GET", "/reviews/my", { token: t2 });
  const review2Id = r.data[0]._id;
  r = await api("DELETE", `/reviews/${review2Id}`, { token: t2 });
  check("owner deletes own review -> 200", r.status === 200);
  pr = await productRating(t1, productId);
  check("product rating resets to 0 / 0", pr.avg === 0 && pr.count === 0, `avg=${pr.avg} count=${pr.count}`);

  // cleanup
  const oid = (id) => new mongoose.Types.ObjectId(id);
  await Promise.all([
    User.deleteMany({ _id: { $in: created.users.map(oid) } }),
    mongoose.connection.collection("reviews").deleteMany({ product: oid(productId) }),
    mongoose.connection.collection("products").deleteMany({ _id: { $in: created.products.map(oid) } }),
    mongoose.connection.collection("categories").deleteMany({ _id: { $in: created.categories.map(oid) } }),
  ]);

  console.log(`\n${"=".repeat(50)}`);
  console.log(`${pass} passed, ${fail} failed`);
  console.log(fail === 0 ? `${G}Reviews & ratings working \u2705${X}\n` : `${R}Some checks failed \u2717${X}\n`);
};

mongoose.connect(env.mongoUri).then(main)
  .catch((e) => { console.error(`${R}Test error:${X}`, e.message); fail++; })
  .finally(async () => { await mongoose.disconnect(); process.exit(fail === 0 ? 0 : 1); });

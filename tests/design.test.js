// Test for the design (canvas) module: CRUD + ownership.
// PREREQUISITES: MongoDB running + server running (npm run dev).
// RUN: node tests/design.test.js

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

const main = async () => {
  console.log(`\nTesting designs at ${API}\n${"=".repeat(50)}`);

  // two users, so we can test ownership
  let r = await api("POST", "/auth/register", { body: { name: "D1", email: `d1_${stamp}@test.com`, password } });
  const t1 = r.data.accessToken; const u1 = r.data.user._id;
  r = await api("POST", "/auth/register", { body: { name: "D2", email: `d2_${stamp}@test.com`, password } });
  const t2 = r.data.accessToken; const u2 = r.data.user._id;

  const canvas = { version: "6", objects: [{ type: "textbox", text: "Hello" }] };

  r = await api("POST", "/designs", { token: t1, body: { name: "My card", canvas, width: 900, height: 500 } });
  const id = r.data._id;
  check("create design -> 201", r.status === 201 && !!id, `status ${r.status}`);

  r = await api("GET", "/designs", { token: t1 });
  check("list my designs -> 200 (1)", r.status === 200 && r.data.length === 1);
  check("list omits heavy canvas", r.data[0]?.canvas === undefined);

  r = await api("GET", `/designs/${id}`, { token: t1 });
  check("get design -> 200 with canvas", r.status === 200 && r.data.canvas?.objects?.length === 1);

  r = await api("GET", `/designs/${id}`, { token: t2 });
  check("other user cannot read it -> 403", r.status === 403);

  r = await api("PUT", `/designs/${id}`, { token: t1, body: { name: "Renamed", status: "published" } });
  check("update design -> 200", r.status === 200 && r.data.name === "Renamed" && r.data.status === "published");

  r = await api("PUT", `/designs/${id}`, { token: t2, body: { name: "hijack" } });
  check("other user cannot update -> 403", r.status === 403);

  r = await api("DELETE", `/designs/${id}`, { token: t2 });
  check("other user cannot delete -> 403", r.status === 403);

  r = await api("DELETE", `/designs/${id}`, { token: t1 });
  check("owner deletes -> 200", r.status === 200);

  r = await api("GET", `/designs/${id}`, { token: t1 });
  check("deleted design -> 404", r.status === 404);

  await User.deleteMany({ _id: { $in: [u1, u2] } });

  console.log(`\n${"=".repeat(50)}`);
  console.log(`${pass} passed, ${fail} failed`);
  console.log(fail === 0 ? `${G}Design module working \u2705${X}\n` : `${R}Some checks failed \u2717${X}\n`);
};

mongoose.connect(env.mongoUri).then(main)
  .catch((e) => { console.error(`${R}Test error:${X}`, e.message); fail++; })
  .finally(async () => { await mongoose.disconnect(); process.exit(fail === 0 ? 0 : 1); });

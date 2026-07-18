// Tests the design extensions: templates (public read, admin CRUD, use->clone),
// fonts (public read, admin CRUD), and PDF export of a design.
//
// PREREQUISITES: MongoDB + server running (npm run dev).
// RUN: node tests/design-extensions.test.js

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

// A valid 4x4 RGBA PNG data URL, so PDFKit has a real image to embed.
const PNG_1x1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAEklEQVR4nGNQdnj2HxkzkC4AAL+wJIFGvHvQAAAAAElFTkSuQmCC";

const stamp = Date.now();
const password = "Passw0rd!";
const created = { templates: [], fonts: [], designs: [], users: [] };

const main = async () => {
  console.log(`\nTesting design extensions at ${API}\n${"=".repeat(50)}`);

  let r = await api("POST", "/auth/register", { body: { name: "DxCust", email: `dx_c_${stamp}@test.com`, password } });
  const custToken = r.data.accessToken; const custId = r.data.user._id; created.users.push(custId);
  r = await api("POST", "/auth/register", { body: { name: "DxAdm", email: `dx_a_${stamp}@test.com`, password } });
  const adminId = r.data.user._id; created.users.push(adminId);
  await User.findByIdAndUpdate(adminId, { role: "admin" });
  r = await api("POST", "/auth/login", { body: { email: `dx_a_${stamp}@test.com`, password } });
  const adminToken = r.data.accessToken;

  // ---------- Templates ----------
  console.log("Templates");
  r = await api("POST", "/templates", { token: custToken, body: { name: "x" } });
  check("customer create template -> 403", r.status === 403);

  r = await api("POST", "/templates", {
    token: adminToken,
    body: { name: `Tmpl ${stamp}`, canvas: { objects: [{ type: "textbox", text: "Hi" }] }, width: 800, height: 400, thumbnail: PNG_1x1, tags: ["card"] },
  });
  const templateId = r.data._id; created.templates.push(templateId);
  check("admin create template -> 201", r.status === 201 && !!templateId, `status ${r.status}`);

  r = await api("GET", "/templates");
  check("public list templates -> 200", r.status === 200 && Array.isArray(r.data));
  check("list omits heavy canvas", r.data.find((t) => t._id === templateId)?.canvas === undefined);

  r = await api("GET", `/templates/${templateId}`);
  check("get template incl canvas -> 200", r.status === 200 && r.data.canvas?.objects?.length === 1);

  // use template -> clones into a personal design
  r = await api("POST", `/templates/${templateId}/use`, { token: custToken, body: { name: "My from template" } });
  const designId = r.data._id; created.designs.push(designId);
  check("use template -> 201 clones design", r.status === 201 && r.data.user === custId && r.data.canvas?.objects?.length === 1, `status ${r.status}`);

  r = await api("DELETE", `/templates/${templateId}`, { token: adminToken });
  check("admin delete template -> 200", r.status === 200);

  // ---------- Fonts ----------
  console.log("Fonts");
  r = await api("POST", "/fonts", { token: custToken, body: { name: "x", family: "x" } });
  check("customer create font -> 403", r.status === 403);

  r = await api("POST", "/fonts", { token: adminToken, body: { name: `Space Grotesk ${stamp}`, family: "Space Grotesk", category: "sans" } });
  const fontId = r.data._id; created.fonts.push(fontId);
  check("admin create font -> 201", r.status === 201 && !!fontId);

  r = await api("GET", "/fonts");
  check("public list fonts -> 200 includes ours", r.status === 200 && r.data.some((f) => f._id === fontId));

  r = await api("PUT", `/fonts/${fontId}`, { token: adminToken, body: { category: "display" } });
  check("admin update font -> 200", r.status === 200 && r.data.category === "display");

  r = await api("DELETE", `/fonts/${fontId}`, { token: adminToken });
  check("admin delete font -> 200", r.status === 200);

  // ---------- PDF export ----------
  console.log("PDF export");
  // design with a thumbnail to render
  r = await api("POST", "/designs", { token: custToken, body: { name: "PDF design", canvas: { objects: [] }, width: 300, height: 200, thumbnail: PNG_1x1 } });
  const pdfDesignId = r.data._id; created.designs.push(pdfDesignId);

  // raw fetch to read the binary PDF
  const pdfRes = await fetch(`${API}/designs/${pdfDesignId}/pdf`, {
    method: "POST",
    headers: { Authorization: `Bearer ${custToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const ct = pdfRes.headers.get("content-type") || "";
  const head = Buffer.from(await pdfRes.arrayBuffer()).slice(0, 5).toString("latin1");
  check("export pdf -> 200 application/pdf", pdfRes.status === 200 && ct.includes("application/pdf"), `status ${pdfRes.status} ct ${ct}`);
  check("body is a real PDF (%PDF header)", head.startsWith("%PDF"), head);

  // non-owner cannot export
  r = await api("POST", `/designs/${pdfDesignId}/pdf`, { token: adminToken });
  check("non-owner export -> 403", r.status === 403, `status ${r.status}`);

  // design with no image -> 400
  r = await api("POST", "/designs", { token: custToken, body: { name: "No thumb", canvas: {} } });
  const noThumbId = r.data._id; created.designs.push(noThumbId);
  r = await api("POST", `/designs/${noThumbId}/pdf`, { token: custToken });
  check("export with no image -> 400", r.status === 400, `status ${r.status}`);

  // cleanup
  const oid = (id) => new mongoose.Types.ObjectId(id);
  await Promise.all([
    User.deleteMany({ _id: { $in: created.users.map(oid) } }),
    mongoose.connection.collection("templates").deleteMany({ _id: { $in: created.templates.map(oid) } }),
    mongoose.connection.collection("fonts").deleteMany({ _id: { $in: created.fonts.map(oid) } }),
    mongoose.connection.collection("designs").deleteMany({ _id: { $in: created.designs.map(oid) } }),
  ]);

  console.log(`\n${"=".repeat(50)}`);
  console.log(`${pass} passed, ${fail} failed`);
  console.log(fail === 0 ? `${G}Design extensions working \u2705${X}\n` : `${R}Some checks failed \u2717${X}\n`);
};

mongoose.connect(env.mongoUri).then(main)
  .catch((e) => { console.error(`${R}Test error:${X}`, e.message); fail++; })
  .finally(async () => { await mongoose.disconnect(); process.exit(fail === 0 ? 0 : 1); });

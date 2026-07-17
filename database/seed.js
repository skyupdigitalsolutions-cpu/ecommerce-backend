// Creates (or re-promotes) a known admin, plus a sample category & product.
// Run against whichever DB your .env MONGO_URI points at.
//   node database/seed.js
require("dotenv").config();
const mongoose = require("mongoose");
const env = require("../config/env");

const User = require("../models/user.model");
const Category = require("../models/category.model");
const Product = require("../models/product.model");

const ADMIN = { name: "Store Admin", email: "admin@store.com", password: "Admin@123" };

const run = async () => {
  await mongoose.connect(env.mongoUri);
  console.log("Connected:", env.mongoUri.replace(/\/\/.*@/, "//***@"));

  // Admin — create if missing, force role=admin if it exists.
  let admin = await User.findOne({ email: ADMIN.email });
  if (!admin) {
    admin = await User.create({ ...ADMIN, role: "admin", isEmailVerified: true });
    console.log(`Created admin: ${ADMIN.email} / ${ADMIN.password}`);
  } else {
    admin.role = "admin";
    await admin.save();
    console.log(`Admin already existed — ensured role=admin: ${ADMIN.email}`);
  }

  // Sample category + product so the shop isn't empty.
  let category = await Category.findOne({ name: "Business Cards" });
  if (!category) {
    category = await Category.create({ name: "Business Cards", description: "Premium printed cards" });
    console.log("Created category: Business Cards");
  }
  const exists = await Product.findOne({ name: "Classic Business Card" });
  if (!exists) {
    await Product.create({
      name: "Classic Business Card",
      description: "300gsm matte finish, double sided",
      category: category._id,
      price: 500, discount: 10, stock: 100,
      material: "Paper", paperType: "300gsm Matte", printType: "Digital",
      colorOptions: ["White", "Cream"], dimensions: "90mm x 55mm",
    });
    console.log("Created product: Classic Business Card");
  }

  console.log("\nSeed complete. Admin login: admin@store.com / Admin@123");
  await mongoose.disconnect();
  process.exit(0);
};

run().catch(async (e) => { console.error("Seed failed:", e.message); await mongoose.disconnect(); process.exit(1); });
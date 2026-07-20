// Seeds the 10 print-shop categories (+ their subcategories) and all products
// from database/data/*.json into MongoDB, mapping each JSON product onto the
// Product schema (models/product.model.js).
//
// Idempotent: re-running upserts by slug/name instead of duplicating.
//
//   node database/seedProducts.js            # upsert everything
//   node database/seedProducts.js --fresh    # wipe products + categories first
//   node database/seedProducts.js --no-subs  # skip creating subcategories
//
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const env = require("../config/env");
const Category = require("../models/category.model");
const Product = require("../models/product.model");

const DATA_DIR = path.join(__dirname, "data");
const FRESH = process.argv.includes("--fresh");
const SKIP_SUBS = process.argv.includes("--no-subs");

// Same slug rule used by the model pre-save hooks (kept in sync so slugs match
// whether a doc is created here via upsert or elsewhere via .save()).
const slugify = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// A handful of item types that aren't personalised print jobs.
const NON_CUSTOMIZABLE = new Set(["Refill Ink", "Ink Pads"]);

// Map one JSON product -> a Product document, given its parent category id.
function toProductDoc(p, categoryId) {
  return {
    name: p.title || p.name,
    slug: slugify(p.title || p.name),
    description: p.subtitle || "",
    category: categoryId,
    subcategory: p.type || undefined,
    price: Number(p.priceValue ?? 0),
    discount: Number(p.discountPercent ?? 0),
    // JSON stores image URLs as strings; the schema wants { url, publicId }.
    images: (p.images || []).map((url) => ({ url, publicId: null })),
    stock: p.inStock === false ? 0 : 100,
    ratingsAverage: Number(p.rating ?? 0),
    ratingsCount: Number(p.reviews ?? 0),
    isActive: true,
    customizable: !NON_CUSTOMIZABLE.has(p.type),
  };
}

async function upsertCategory({ name, slug, description, image, parent = null }) {
  return Category.findOneAndUpdate(
    { name },
    {
      $set: { slug: slug || slugify(name), description, image, parent },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

async function run() {
  await mongoose.connect(env.mongoUri);
  console.log("Connected:", env.mongoUri.replace(/\/\/.*@/, "//***@"));

  if (FRESH) {
    await Product.deleteMany({});
    await Category.deleteMany({});
    console.log("Wiped existing products and categories (--fresh).");
  }

  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

  let catCount = 0;
  let subCount = 0;
  let prodCount = 0;

  for (const file of files) {
    const doc = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf-8"));

    // 1) top-level category
    const firstImg = doc.products?.[0]?.images?.[0] || undefined;
    const category = await upsertCategory({
      name: doc.category,
      slug: doc.slug,
      description: doc.displayName || doc.category,
      image: firstImg,
      parent: null,
    });
    catCount++;

    // 2) subcategories from items[] (parent = this category)
    if (!SKIP_SUBS && Array.isArray(doc.items)) {
      for (const item of doc.items) {
        try {
          await upsertCategory({
            name: item,
            slug: slugify(`${doc.slug}-${item}`),
            description: `${item} — ${doc.category}`,
            parent: category._id,
          });
          subCount++;
        } catch (e) {
          // Category.name is globally unique; if an item name repeats across
          // categories just skip the duplicate rather than crash the seed.
          if (e.code !== 11000) throw e;
        }
      }
    }

    // 3) products (upsert by slug)
    for (const p of doc.products) {
      const payload = toProductDoc(p, category._id);
      await Product.findOneAndUpdate({ slug: payload.slug }, { $set: payload }, {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      });
      prodCount++;
    }

    console.log(
      `  ${doc.category.padEnd(38)} ${doc.products.length} products`
    );
  }

  console.log(
    `\nDone. Categories: ${catCount}, Subcategories: ${subCount}, Products: ${prodCount}`
  );
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(async (e) => {
  console.error("Seed failed:", e.message);
  await mongoose.disconnect();
  process.exit(1);
});

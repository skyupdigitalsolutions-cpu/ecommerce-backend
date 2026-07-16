const Product = require("../models/product.model");
const { uploadImage, deleteImage } = require("../helpers/uploadImage");

// GET /api/products  - public
// Supports ?keyword= &category= &minPrice= &maxPrice= &sort= &page= &limit=
// This is the CRUD app's getProducts, grown up with filtering + pagination.
const getProducts = async (req, res) => {
  try {
    const { keyword, category, minPrice, maxPrice, sort } = req.query;

    const filter = { isActive: true };
    if (keyword) filter.name = { $regex: keyword, $options: "i" };
    if (category) filter.category = category;
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    // Whitelist a few sort options; default to newest first.
    const sortMap = {
      price_asc: { price: 1 },
      price_desc: { price: -1 },
      newest: { createdAt: -1 },
    };
    const sortBy = sortMap[sort] || { createdAt: -1 };

    const [products, total] = await Promise.all([
      Product.find(filter)
        .populate("category", "name slug")
        .sort(sortBy)
        .skip(skip)
        .limit(limit),
      Product.countDocuments(filter),
    ]);

    res.status(200).json({
      products,
      page,
      pages: Math.ceil(total / limit),
      total,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/products/:id  - public
const getProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate(
      "category",
      "name slug"
    );
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.status(200).json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/products  (admin) - accepts multipart form-data with image files
const createProduct = async (req, res) => {
  try {
    const data = { ...req.body };

    // colorOptions may arrive as "red,blue" from a form; normalise to array.
    if (typeof data.colorOptions === "string") {
      data.colorOptions = data.colorOptions.split(",").map((c) => c.trim());
    }

    // Upload any attached image files to Cloudinary (see upload middleware).
    if (req.files && req.files.length) {
      data.images = await Promise.all(
        req.files.map((file) => uploadImage(file.buffer, "products"))
      );
    }

    const product = await Product.create(data);
    res.status(201).json(product);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// PUT /api/products/:id  (admin)
const updateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const data = { ...req.body };
    if (typeof data.colorOptions === "string") {
      data.colorOptions = data.colorOptions.split(",").map((c) => c.trim());
    }

    // If new images were uploaded, add them to the existing ones.
    if (req.files && req.files.length) {
      const uploaded = await Promise.all(
        req.files.map((file) => uploadImage(file.buffer, "products"))
      );
      data.images = [...product.images, ...uploaded];
    }

    Object.assign(product, data);
    await product.save(); // save() so the slug hook runs
    res.status(200).json(product);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// DELETE /api/products/:id  (admin)
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Clean up the product's images from Cloudinary too.
    await Promise.all((product.images || []).map((img) => deleteImage(img.publicId)));

    res.status(200).json({ message: "Product deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
};

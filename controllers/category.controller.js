const Category = require("../models/category.model");

// GET /api/categories  - public, everyone can browse categories
const getCategories = async (req, res) => {
  try {
    const categories = await Category.find({}).populate("parent", "name slug");
    res.status(200).json(categories);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/categories/:id  - public
const getCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id).populate(
      "parent",
      "name slug"
    );
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }
    res.status(200).json(category);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/categories  (admin)
const createCategory = async (req, res) => {
  try {
    const category = await Category.create(req.body);
    res.status(201).json(category);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// PUT /api/categories/:id  (admin)
const updateCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }
    // Assign fields then save() so the slug pre-save hook runs.
    Object.assign(category, req.body);
    await category.save();
    res.status(200).json(category);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// DELETE /api/categories/:id  (admin)
const deleteCategory = async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }
    res.status(200).json({ message: "Category deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
};

const Font = require("../models/font.model");

// GET /api/fonts  (public) - active fonts for the editor
const getFonts = async (req, res) => {
  try {
    const fonts = await Font.find({ isActive: true }).sort({ name: 1 });
    res.status(200).json(fonts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/fonts  (admin)
const createFont = async (req, res) => {
  try {
    const font = await Font.create(req.body);
    res.status(201).json(font);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// PUT /api/fonts/:id  (admin)
const updateFont = async (req, res) => {
  try {
    const font = await Font.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!font) return res.status(404).json({ message: "Font not found" });
    res.status(200).json(font);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// DELETE /api/fonts/:id  (admin)
const deleteFont = async (req, res) => {
  try {
    const font = await Font.findByIdAndDelete(req.params.id);
    if (!font) return res.status(404).json({ message: "Font not found" });
    res.status(200).json({ message: "Font deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getFonts, createFont, updateFont, deleteFont };

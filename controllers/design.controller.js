const Design = require("../models/design.model");

// GET /api/designs  (protected) - the logged-in user's designs (no heavy canvas)
const getMyDesigns = async (req, res) => {
  try {
    const designs = await Design.find({ user: req.user._id })
      .select("-canvas") // list view doesn't need the full canvas payload
      .sort({ updatedAt: -1 });
    res.status(200).json(designs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/designs/:id  (protected, owner) - full design incl. canvas
const getDesign = async (req, res) => {
  try {
    const design = await Design.findById(req.params.id);
    if (!design) return res.status(404).json({ message: "Design not found" });
    if (design.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }
    res.status(200).json(design);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/designs  (protected) - create a new design
const createDesign = async (req, res) => {
  try {
    const { name, product, canvas, width, height, thumbnail, status } = req.body;
    const design = await Design.create({
      user: req.user._id,
      name,
      product: product || null,
      canvas: canvas || {},
      width,
      height,
      thumbnail,
      status,
    });
    res.status(201).json(design);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// PUT /api/designs/:id  (protected, owner) - save changes
const updateDesign = async (req, res) => {
  try {
    const design = await Design.findById(req.params.id);
    if (!design) return res.status(404).json({ message: "Design not found" });
    if (design.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const fields = ["name", "product", "canvas", "width", "height", "thumbnail", "status"];
    for (const f of fields) {
      if (req.body[f] !== undefined) design[f] = req.body[f];
    }
    await design.save();
    res.status(200).json(design);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// DELETE /api/designs/:id  (protected, owner)
const deleteDesign = async (req, res) => {
  try {
    const design = await Design.findById(req.params.id);
    if (!design) return res.status(404).json({ message: "Design not found" });
    if (design.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }
    await design.deleteOne();
    res.status(200).json({ message: "Design deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getMyDesigns, getDesign, createDesign, updateDesign, deleteDesign };

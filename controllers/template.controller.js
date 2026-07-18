const Template = require("../models/template.model");
const Design = require("../models/design.model");

// GET /api/templates  (public)  optional ?category= &tag=
const getTemplates = async (req, res) => {
  try {
    const filter = { isActive: true };
    if (req.query.category) filter.category = req.query.category;
    if (req.query.tag) filter.tags = req.query.tag;
    const templates = await Template.find(filter)
      .select("-canvas") // list view is lightweight
      .sort({ createdAt: -1 });
    res.status(200).json(templates);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/templates/:id  (public)  full template incl. canvas
const getTemplate = async (req, res) => {
  try {
    const template = await Template.findById(req.params.id);
    if (!template) return res.status(404).json({ message: "Template not found" });
    res.status(200).json(template);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/templates  (admin)
const createTemplate = async (req, res) => {
  try {
    const template = await Template.create(req.body);
    res.status(201).json(template);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// PUT /api/templates/:id  (admin)
const updateTemplate = async (req, res) => {
  try {
    const template = await Template.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!template) return res.status(404).json({ message: "Template not found" });
    res.status(200).json(template);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// DELETE /api/templates/:id  (admin)
const deleteTemplate = async (req, res) => {
  try {
    const template = await Template.findByIdAndDelete(req.params.id);
    if (!template) return res.status(404).json({ message: "Template not found" });
    res.status(200).json({ message: "Template deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/templates/:id/use  (protected)  body: { name?, product? }
// Clones the template's canvas into a new personal design for the user.
const useTemplate = async (req, res) => {
  try {
    const template = await Template.findById(req.params.id);
    if (!template) return res.status(404).json({ message: "Template not found" });

    const design = await Design.create({
      user: req.user._id,
      name: req.body.name || template.name,
      product: req.body.product || null,
      canvas: template.canvas,
      width: template.width,
      height: template.height,
      thumbnail: template.thumbnail,
    });
    res.status(201).json(design);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  useTemplate,
};

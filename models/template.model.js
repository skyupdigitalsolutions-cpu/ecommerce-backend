const mongoose = require("mongoose");

// A pre-made design users can start from. Admin-managed and global (no owner).
// "Using" a template clones its canvas into a personal Design (see controller).
const TemplateSchema = mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    canvas: { type: mongoose.Schema.Types.Mixed, default: {} },
    width: { type: Number, default: 1050 },
    height: { type: Number, default: 600 },
    thumbnail: { type: String },
    tags: [{ type: String }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Template", TemplateSchema);

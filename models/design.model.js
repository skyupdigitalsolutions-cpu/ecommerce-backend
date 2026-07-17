const mongoose = require("mongoose");

// A saved design: the editor serialises its canvas to JSON (Fabric's toJSON)
// and we store it here. `product` is optional — a design can be standalone or
// created for a specific product.
const DesignSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    name: { type: String, default: "Untitled design", trim: true },

    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
    },

    // The whole editor canvas, as produced by canvas.toJSON(). Mixed = free-form.
    canvas: { type: mongoose.Schema.Types.Mixed, default: {} },

    width: { type: Number, default: 900 },
    height: { type: Number, default: 500 },

    // A small preview (data URL or Cloudinary URL) for the "my designs" grid.
    thumbnail: { type: String },

    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
    },
  },
  { timestamps: true }
);

const Design = mongoose.model("Design", DesignSchema);

module.exports = Design;

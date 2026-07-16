const mongoose = require("mongoose");

const CategorySchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Please enter category name"],
      trim: true,
      unique: true,
    },

    slug: {
      type: String,
      lowercase: true,
      trim: true,
    },

    description: { type: String },

    image: { type: String },

    // A category with a parent is effectively a subcategory. Top-level
    // categories simply have parent = null.
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },

    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

// Build a URL-friendly slug from the name whenever the name changes.
CategorySchema.pre("save", function () {
  if (this.isModified("name")) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
});

const Category = mongoose.model("Category", CategorySchema);

module.exports = Category;
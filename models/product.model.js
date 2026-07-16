const mongoose = require("mongoose");

// This is the CRUD app's Product schema, expanded with the print-shop fields
// from the requirements (material, paper type, print type, dimensions, etc.).
// The shape and style are the same: fields + { timestamps: true }.
const ProductSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Please enter product name"],
      trim: true,
    },

    slug: { type: String, lowercase: true, trim: true },

    description: { type: String, default: "" },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "Please choose a category"],
    },

    price: {
      type: Number,
      required: true,
      default: 0,
    },

    // Percentage discount (0-100). Selling price is computed in the controller.
    discount: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    // Print-specific attributes.
    material: { type: String },
    paperType: { type: String },
    printType: { type: String },
    colorOptions: [{ type: String }],
    dimensions: { type: String }, // e.g. "90mm x 55mm"

    // Cloudinary images: we store both the URL and the publicId so we can
    // delete them from Cloudinary later.
    images: [
      {
        url: { type: String, required: true },
        publicId: { type: String },
      },
    ],

    stock: {
      type: Number,
      required: true,
      default: 0,
    },

    // Simple rating summary; the Review module (later phase) will keep these
    // in sync as reviews are added.
    ratingsAverage: { type: Number, default: 0 },
    ratingsCount: { type: Number, default: 0 },

    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

ProductSchema.pre("save", function () {
  if (this.isModified("name")) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
});

const Product = mongoose.model("Product", ProductSchema);

module.exports = Product;
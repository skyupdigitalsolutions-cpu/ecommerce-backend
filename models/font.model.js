const mongoose = require("mongoose");

// A font the design editor can offer. `family` is the CSS font-family; `url` is
// an optional web-font stylesheet/file the editor can load.
const FontSchema = mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // display name
    family: { type: String, required: true, trim: true }, // css family
    url: { type: String }, // optional web-font url
    category: { type: String }, // serif / sans / display / mono / handwriting
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Font", FontSchema);

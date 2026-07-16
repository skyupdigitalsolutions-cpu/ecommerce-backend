const { v2: cloudinary } = require("cloudinary");
const env = require("./env");

// Configure the Cloudinary SDK once at startup. The actual upload logic
// lives in helpers/uploadImage.js so controllers just call one function.
cloudinary.config({
  cloud_name: env.cloudinary.cloudName,
  api_key: env.cloudinary.apiKey,
  api_secret: env.cloudinary.apiSecret,
});

module.exports = cloudinary;

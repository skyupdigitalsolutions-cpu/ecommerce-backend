const cloudinary = require("../config/cloudinary");

// Multer gives us the file in memory as a Buffer (see middleware/upload.middleware.js).
// Cloudinary's normal upload() wants a file path, so we stream the buffer using
// upload_stream and wrap it in a Promise so controllers can `await` it.
const uploadImage = (fileBuffer, folder = "ecommerce") => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image" },
      (error, result) => {
        if (error) return reject(error);
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(fileBuffer);
  });
};

// Delete an image later (e.g. when a product is removed).
const deleteImage = async (publicId) => {
  if (!publicId) return;
  await cloudinary.uploader.destroy(publicId);
};

module.exports = { uploadImage, deleteImage };

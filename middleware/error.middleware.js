// notFound: reached when no route matched. Forwards a 404 to the error handler.
const notFound = (req, res, next) => {
  res.status(404);
  next(new Error(`Route not found - ${req.method} ${req.originalUrl}`));
};

// errorHandler: the single place where errors turn into a JSON response.
// Your controllers still use their own try/catch (same as the CRUD app);
// this is a safety net that also tidies up common Mongoose errors.
const errorHandler = (err, req, res, next) => {
  let statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
  let message = err.message || "Server Error";

  // Bad ObjectId (e.g. /api/products/not-a-real-id)
  if (err.name === "CastError") {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  }

  // Mongoose schema validation failed
  if (err.name === "ValidationError") {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join(", ");
  }

  // Duplicate unique field (e.g. email already registered)
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue)[0];
    message = `${field} already exists`;
  }

  res.status(statusCode).json({
    message,
    // Only leak the stack trace in development.
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
  });
};

module.exports = { notFound, errorHandler };

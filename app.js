const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const cookieParser = require("cookie-parser");

const env = require("./config/env");
const routes = require("./routes");
const sanitize = require("./middleware/sanitize.middleware");
const { apiLimiter } = require("./middleware/rateLimiter.middleware");
const { notFound, errorHandler } = require("./middleware/error.middleware");

const app = express();

// ---- Core middleware (runs on every request) ----
app.use(helmet()); // sensible security headers
app.use(
  cors({
    origin: env.clientUrl, // allow the React frontend
    credentials: true, // allow the refresh-token cookie
  })
);
// The `verify` callback stashes the raw request bytes on req.rawBody. The
// Razorpay webhook needs the EXACT bytes (not the re-stringified JSON) to
// validate its signature. Harmless for every other route.
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
); // parse JSON bodies  (same as your CRUD app)
app.use(express.urlencoded({ extended: true })); // parse form bodies (same as CRUD app)
app.use(cookieParser()); // read the refresh-token cookie
app.use(compression()); // gzip responses
app.use(sanitize); // strip $ / . from body keys (Express-5-safe)

// Request logging: pretty console in dev, piped to winston log files in prod.
const logger = require("./config/logger");
if (env.nodeEnv === "production") {
  app.use(morgan("combined", { stream: logger.stream }));
} else {
  app.use(morgan("dev"));
}

// NOTE: xss-clean and hpp are intentionally NOT used here. Both reassign
// req.query, which is read-only in Express 5 and would crash on the first
// request. The sanitize middleware above covers the NoSQL-injection case.

// ---- Health check ----
app.get("/", (req, res) => {
  res.send("Ecommerce API is running");
});

// ---- API routes (all under /api, rate limited) ----
app.use("/api", apiLimiter, routes);

// ---- 404 + central error handler (must be last) ----
app.use(notFound);
app.use(errorHandler);

module.exports = app;

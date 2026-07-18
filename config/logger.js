const path = require("path");
const fs = require("fs");
const winston = require("winston");
const env = require("./env");

// Ensure the log directory exists (file transports don't create it).
const logDir = path.join(__dirname, "..", "logs");
try {
  fs.mkdirSync(logDir, { recursive: true });
} catch (_) {
  // ignore; logging must never crash the app
}

const logger = winston.createLogger({
  // In production capture http-level and above; in dev capture everything.
  level: env.nodeEnv === "production" ? "http" : "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: path.join(logDir, "error.log"), level: "error" }),
    new winston.transports.File({ filename: path.join(logDir, "combined.log") }),
  ],
});

// Human-readable console output (colorized) alongside the JSON files.
logger.add(
  new winston.transports.Console({
    format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
  })
);

// Morgan writes HTTP request lines through this stream.
logger.stream = {
  write: (message) => logger.http(message.trim()),
};

module.exports = logger;

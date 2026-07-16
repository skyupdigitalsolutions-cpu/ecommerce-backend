const crypto = require("crypto");

const hashToken = (raw) => {
  return crypto.createHash("sha256").update(raw).digest("hex");
};

const createToken = () => {
  const raw = crypto.randomBytes(32).toString("hex");
  const hashed = hashToken(raw);
  return { raw, hashed };
};

module.exports = { createToken, hashToken };

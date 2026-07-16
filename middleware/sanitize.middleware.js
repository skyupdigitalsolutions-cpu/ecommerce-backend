// NOTE on Express 5:
// The popular packages `xss-clean` and `hpp` reassign `req.query`, but in
// Express 5 `req.query` is a read-only getter, so using them throws on the
// first request. This lightweight middleware does the important part safely:
// it strips MongoDB operator characters ($ and .) from object KEYS in the
// request body, blocking the most common NoSQL-injection trick. It only
// mutates req.body (which IS writable in Express 5).

const clean = (obj) => {
  if (!obj || typeof obj !== "object") return;

  for (const key of Object.keys(obj)) {
    if (key.startsWith("$") || key.includes(".")) {
      delete obj[key];
      continue;
    }
    if (obj[key] && typeof obj[key] === "object") {
      clean(obj[key]); // recurse into nested objects / arrays
    }
  }
};

const sanitize = (req, res, next) => {
  clean(req.body);
  next();
};

module.exports = sanitize;

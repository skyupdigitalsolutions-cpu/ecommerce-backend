const { validationResult } = require("express-validator");

// Runs after a set of express-validator checks (see the validations/ folder).
// If any check failed, respond 400 with the list of problems; otherwise carry on.
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: "Validation failed",
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

module.exports = validate;

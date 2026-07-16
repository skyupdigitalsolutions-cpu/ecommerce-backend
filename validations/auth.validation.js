const { body } = require("express-validator");

// Each export is an array of express-validator checks. Routes place them before
// the `validate` middleware, which turns any failures into a 400 response.

const registerRules = [
  body("name").trim().notEmpty().withMessage("Name is required"),
  body("email").isEmail().withMessage("A valid email is required"),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),
];

const loginRules = [
  body("email").isEmail().withMessage("A valid email is required"),
  body("password").notEmpty().withMessage("Password is required"),
];

const forgotPasswordRules = [
  body("email").isEmail().withMessage("A valid email is required"),
];

const resetPasswordRules = [
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),
];

module.exports = {
  registerRules,
  loginRules,
  forgotPasswordRules,
  resetPasswordRules,
};

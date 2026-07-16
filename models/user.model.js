const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { ROLES } = require("../constants");

// An address the customer can ship to. Embedded inside the user for simplicity
// (you can split it into its own Addresses collection later if you need to).
const AddressSchema = mongoose.Schema(
  {
    label: { type: String, default: "Home" },
    line1: { type: String, required: true },
    line2: { type: String },
    city: { type: String, required: true },
    state: { type: String, required: true },
    postalCode: { type: String, required: true },
    country: { type: String, default: "India" },
    phone: { type: String },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true }
);

const UserSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Please enter your name"],
      trim: true,
    },

    email: {
      type: String,
      required: [true, "Please enter your email"],
      unique: true,
      lowercase: true,
      trim: true,
    },

    // select: false means the password is NOT returned by default queries.
    // In login we explicitly ask for it with .select("+password").
    password: {
      type: String,
      required: [true, "Please enter a password"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
    },

    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.CUSTOMER,
    },

    phone: { type: String },
    avatar: { type: String },

    isEmailVerified: { type: Boolean, default: false },

    addresses: [AddressSchema],

    // Used by the forgot/reset-password flow.
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },

    // Used by the email-verification flow.
    emailVerificationToken: { type: String, select: false },
    emailVerificationExpires: { type: Date, select: false },
  },
  {
    timestamps: true,
  }
);

// Hash the password automatically before saving, but only when it changed.
UserSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Instance method to compare a plain password against the stored hash.
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model("User", UserSchema);

module.exports = User;

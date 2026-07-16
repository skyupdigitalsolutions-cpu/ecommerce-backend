const mongoose = require("mongoose");
const env = require("./env");

// Same idea as the connect(...).then(...) block in your CRUD app's index.js,
// just pulled into its own file so server.js stays clean.
const connectDB = async () => {
  try {
    await mongoose.connect(env.mongoUri);
    console.log("Connected to database");
  } catch (error) {
    console.log("Connection failed:", error.message);
    // If the DB is down there is no point keeping the server up.
    process.exit(1);
  }
};

module.exports = connectDB;

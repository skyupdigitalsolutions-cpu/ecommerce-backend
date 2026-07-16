const http = require("http");
const app = require("./app");
const env = require("./config/env");
const connectDB = require("./config/db");
const { initSocket } = require("./sockets");

// This is your CRUD app's bootstrap block: connect to Mongo first, then start
// listening. The difference is we create an http.Server so Socket.io can share
// the same port as Express.
const start = async () => {
  await connectDB();

  const server = http.createServer(app);
  initSocket(server); // attach Socket.io

  server.listen(env.port, () => {
    console.log(`Server running on port number ${env.port}`);
  });
};

start();

// Safety net: log unexpected errors instead of dying silently.
process.on("unhandledRejection", (err) => {
  console.log("Unhandled rejection:", err.message);
});

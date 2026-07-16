const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const env = require("../config/env");

let io = null;

// Attach Socket.io to the HTTP server. We keep a module-level `io` reference so
// other parts of the app (e.g. the notification module in a later phase) can
// emit events with getIO().to(userId).emit(...).
const initSocket = (server) => {
  io = new Server(server, {
    cors: { origin: env.clientUrl, credentials: true },
  });

  // Simple handshake auth: the client passes its access token in auth.token.
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("No token"));
      const decoded = jwt.verify(token, env.jwt.accessSecret);
      socket.userId = decoded.id;
      next();
    } catch (err) {
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    // Each user joins a room named after their id, so we can target them later.
    socket.join(socket.userId);
    console.log(`Socket connected: user ${socket.userId}`);

    socket.on("disconnect", () => {
      console.log(`Socket disconnected: user ${socket.userId}`);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
};

module.exports = { initSocket, getIO };

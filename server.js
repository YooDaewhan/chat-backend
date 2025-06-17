const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

let connectedUsers = 0;
const users = {}; // socket.id → { nickname, color }

io.on("connection", (socket) => {
  connectedUsers++;

  socket.on("set nickname", ({ nickname, color }) => {
    users[socket.id] = {
      nickname: nickname || "익명",
      color: color || "#000000",
    };
    io.emit("user list", Object.values(users));
    io.emit("user count", connectedUsers);
  });

  socket.on("chat message", (message) => {
    const user = users[socket.id] || { nickname: "익명", color: "#000000" };
    io.emit("chat message", {
      nickname: user.nickname,
      color: user.color,
      message,
    });
  });

  socket.on("disconnect", () => {
    connectedUsers = Math.max(connectedUsers - 1, 0);
    delete users[socket.id];
    io.emit("user list", Object.values(users));
    io.emit("user count", connectedUsers);
  });
});

server.listen(3001, () => {
  console.log("✅ 서버 실행 중: http://localhost:3001");
});

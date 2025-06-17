// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // 모든 프론트엔드에서 접속 허용 (개발용)
  },
});
const users = {}; // socket.id → nickname 저장용
let connectedUsers = 0;

io.on("connection", (socket) => {
  connectedUsers++;

  socket.on("set nickname", (nickname) => {
    users[socket.id] = nickname || "익명";
    console.log("✅ 닉네임 설정:", nickname);
    io.emit("user list", Object.values(users));
    io.emit("user count", connectedUsers);
  });

  socket.on("chat message", (msg) => {
    io.emit("chat message", msg);
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

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

io.on("connection", (socket) => {
  console.log("🔌 유저 접속됨:", socket.id);

  socket.on("chat message", (msg) => {
    console.log("📩 받은 메시지:", msg);
    io.emit("chat message", msg);
  });

  socket.on("disconnect", () => {
    console.log("❌ 유저 연결 해제:", socket.id);
  });
});

server.listen(3001, () => {
  console.log("✅ 서버 실행 중: http://localhost:3001");
});

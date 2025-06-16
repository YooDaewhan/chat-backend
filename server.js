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

// 현재 접속 중인 유저 수를 저장할 변수
let connectedUsersCount = 0;

io.on("connection", (socket) => {
  const count = io.engine.clientsCount; // ✅ 정확한 접속자 수
  console.log("🔌 접속:", socket.id);
  console.log("현재 접속자 수:", count);

  io.emit("user count update", count);

  socket.on("disconnect", () => {
    const count = io.engine.clientsCount; // 여기도 다시 가져옴
    console.log("❌ 연결 종료:", socket.id);
    console.log("현재 접속자 수:", count);

    io.emit("user count update", count);
  });
});

server.listen(3001, () => {
  console.log("✅ 서버 실행 중: http://localhost:3001");
});

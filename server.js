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

let connectedUsers = 0; // 현재 접속 중인 유저 수

io.on("connection", (socket) => {
  const ip = socket.handshake.address;
  connectedUsers++; // 유저 접속 시 유저 수 증가
  console.log("🔌 유저 접속됨:", socket.id, "IP:", ip);
  console.log("현재 접속 중인 유저 수:", connectedUsers);

  // 모든 클라이언트에 현재 유저 수 업데이트 알림
  io.emit("user count update", connectedUsers);

  socket.on("chat message", (msg) => {
    console.log("📩 받은 메시지:", msg, "from IP:", ip);
    io.emit("chat message", msg);
  });

  socket.on("disconnect", () => {
    connectedUsers--; // 유저 연결 해제 시 유저 수 감소
    console.log("❌ 유저 연결 해제:", socket.id, "IP:", ip);
    console.log("현재 접속 중인 유저 수:", connectedUsers);

    // 모든 클라이언트에 현재 유저 수 업데이트 알림
    io.emit("user count update", connectedUsers);
  });
});

server.listen(3001, () => {
  console.log("✅ 서버 실행 중: http://localhost:3001");
});

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
  connectedUsersCount++; // 유저 접속 시 카운트 증가
  console.log("🔌 유저 접속됨:", socket.id);
  console.log("현재 접속 중인 유저 수:", connectedUsersCount); // 콘솔에 현재 접속자 수 출력

  // 모든 클라이언트에게 현재 접속자 수 업데이트 알림 (프론트엔드에서 받아서 표시 가능)
  io.emit("user count update", connectedUsersCount);

  socket.on("chat message", (msg) => {
    console.log("📩 받은 메시지:", msg, socket.id);
    io.emit("chat message", msg);
  });

  socket.on("disconnect", () => {
    connectedUsersCount--; // 유저 연결 해제 시 카운트 감소
    console.log("❌ 유저 연결 해제:", socket.id);
    console.log("현재 접속 중인 유저 수:", connectedUsersCount); // 콘솔에 현재 접속자 수 출력

    // 모든 클라이언트에게 현재 접속자 수 업데이트 알림
    io.emit("user count update", connectedUsersCount);
  });
});

server.listen(3001, () => {
  console.log("✅ 서버 실행 중: http://localhost:3001");
});

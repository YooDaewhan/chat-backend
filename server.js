const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  pingTimeout: 20000,
  pingInterval: 25000,
});

io.on("connection", (socket) => {
  const count = io.engine.clientsCount;
  console.log("🔌 유저 접속됨:", socket.id);
  console.log("현재 접속자 수:", count);

  io.emit("user count update", count);

  socket.on("disconnect", () => {
    const count = io.engine.clientsCount;
    console.log("❌ 유저 연결 해제:", socket.id);
    console.log("현재 접속자 수:", count);

    io.emit("user count update", count);
  });
});

server.listen(3001, () => {
  console.log("✅ 서버 실행 중: http://localhost:3001");
});

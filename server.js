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

const users = {}; // ✅ 반드시 선언 필요
let currentQuiz = null;

io.on("connection", (socket) => {
  socket.on("set nickname", ({ nickname, color }) => {
    users[socket.id] = { nickname, color };
    io.emit("user list", Object.values(users));
    io.emit("user count", Object.keys(users).length);
  });

  socket.on("quiz new", ({ question, answer }) => {
    currentQuiz = {
      question,
      answer: answer.trim().toLowerCase(),
      solved: false,
    };
    const user = users[socket.id];
    console.log("📢 문제 출제:", question, "/ 정답:", currentQuiz.answer);
    io.emit("chat message", {
      nickname: "[문제]",
      color: "#d9534f",
      message: question,
    });
  });

  socket.on("chat message", (msg) => {
    const user = users[socket.id] || { nickname: "익명", color: "#000000" };
    const trimmed = msg.trim().toLowerCase();

    if (currentQuiz && !currentQuiz.solved && trimmed === currentQuiz.answer) {
      currentQuiz.solved = true;
      io.emit("quiz correct", {
        nickname: user.nickname,
        color: user.color,
      });
    } else {
      io.emit("chat message", {
        nickname: user.nickname,
        color: user.color,
        message: msg,
      });
    }
  });

  socket.on("disconnect", () => {
    delete users[socket.id];
    io.emit("user list", Object.values(users));
    io.emit("user count", Object.keys(users).length);
  });
});

server.listen(3001, () => {
  console.log("✅ 서버 실행 중: http://localhost:3001");
});

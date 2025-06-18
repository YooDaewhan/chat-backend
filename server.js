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

let users = {}; // socket.id -> { nickname, color }
let scores = {}; // socket.id -> 점수
let quizHistory = []; // {id, question, answer, solved, ...}
let quizCounter = 0;
let hostId = null;

io.on("connection", (socket) => {
  // 닉네임/색상 설정 및 초기화
  socket.on("set nickname", ({ nickname, color }) => {
    users[socket.id] = { nickname, color };
    if (!hostId) hostId = socket.id;
    io.emit("user list", users);
    socket.emit("userId", socket.id);
    io.emit("user count", Object.keys(users).length);
  });

  // "chat message" 이벤트 단일 처리!
  socket.on("chat message", (msg) => {
    console.log(`[MSG][${socket.id}]`, msg);

    const user = users[socket.id] || { nickname: "익명", color: "#000" };
    const trimmed = msg.trim().toLowerCase();
    const unsolved = quizHistory.find((q) => !q.solved && trimmed === q.answer);
    if (unsolved) {
      unsolved.solved = true;
      scores[socket.id] = (scores[socket.id] || 0) + 1;

      io.emit("chat message", {
        senderId: "system",
        message: `[정답] ${user.nickname}님이 [문제${unsolved.id}]의 정답 [${unsolved.answer}]"를 맞췄습니다!`,
      });

      io.emit(
        "active quizzes",
        quizHistory.filter((q) => !q.solved)
      );

      // 랭킹 송신 (점수로 정렬)
      const leaderboard = Object.entries(scores)
        .map(([sid, score]) => ({ sid, score }))
        .sort((a, b) => b.score - a.score);
      io.emit("quiz leaderboard", leaderboard);
    } else {
      // 정답 아니면 일반 채팅 메시지로
      io.emit("chat message", { senderId: socket.id, message: msg });
    }
  });

  // 퀴즈 출제 (방장만)
  socket.on("quiz new", ({ question, answer }) => {
    if (socket.id !== hostId) return;
    quizCounter += 1;
    const quiz = {
      id: quizCounter,
      question,
      answer: answer.trim().toLowerCase(),
      solved: false,
      createdAt: Date.now(),
      timeout: Date.now() + 30 * 1000,
    };
    quizHistory.push(quiz);

    io.emit("chat message", {
      senderId: "system",
      message: `[문제${quiz.id}] ${question}`,
    });

    io.emit(
      "active quizzes",
      quizHistory.filter((q) => !q.solved)
    );

    setTimeout(() => {
      if (!quiz.solved) {
        quiz.solved = true;
        io.emit("chat message", {
          senderId: "system",
          message: `[문제${quiz.id}] 시간 초과! 정답: ${quiz.answer}`,
        });
        io.emit(
          "active quizzes",
          quizHistory.filter((q) => !q.solved)
        );
      }
    }, 30 * 1000);
  });

  // 연결 종료
  socket.on("disconnect", () => {
    delete users[socket.id];
    delete scores[socket.id];
    if (hostId === socket.id) hostId = Object.keys(users)[0] || null;
    io.emit("user list", users);
    io.emit("user count", Object.keys(users).length);
  });
});

server.listen(3001, () => {
  console.log("✅ 서버 실행 중: http://localhost:3001");
});

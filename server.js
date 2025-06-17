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

const users = {}; // socket.id -> { nickname, color }
const bannedNicknames = new Set();
let quizzes = []; // { question, answer, solved, solver, solvedAt, timer }
let scores = {}; // nickname -> score
let hostId = null;

const QUIZ_TIME_LIMIT = 20 * 1000; // 20초

io.on("connection", (socket) => {
  const ip = socket.handshake.address;

  socket.on("set nickname", ({ nickname, color }) => {
    if (bannedNicknames.has(nickname)) {
      socket.emit("banned", "해당 닉네임은 차단되었습니다.");
      socket.disconnect();
      return;
    }

    users[socket.id] = { nickname, color };

    if (!hostId) {
      hostId = socket.id;
    }

    io.emit("user list", Object.values(users));
    io.emit("user count", Object.keys(users).length);
    socket.emit("host status", { isHost: socket.id === hostId });
  });

  socket.on("chat message", (msg) => {
    const user = users[socket.id];
    if (!user) return;

    const trimmed = msg.trim().toLowerCase();
    const matchingQuiz = quizzes.find((q) => !q.solved && q.answer === trimmed);

    if (matchingQuiz) {
      matchingQuiz.solved = true;
      matchingQuiz.solver = user.nickname;
      matchingQuiz.solvedAt = new Date().toISOString();
      scores[user.nickname] = (scores[user.nickname] || 0) + 1;

      io.emit("quiz correct", {
        nickname: user.nickname,
        color: user.color,
        question: matchingQuiz.question,
      });

      broadcastLeaderboard();
    } else {
      io.emit("chat message", {
        nickname: user.nickname,
        color: user.color,
        message: msg,
      });
    }
  });

  socket.on("quiz new", ({ question, answer }) => {
    if (socket.id !== hostId) return;

    const newQuiz = {
      question,
      answer: answer.trim().toLowerCase(),
      solved: false,
    };

    quizzes.push(newQuiz);

    io.emit("chat message", {
      nickname: "[문제]",
      color: "#d9534f",
      message: question,
    });

    setTimeout(() => {
      if (!newQuiz.solved) {
        newQuiz.solved = true;
        io.emit("chat message", {
          nickname: "[시간초과]",
          color: "#999",
          message: `문제 [${question}] 시간이 초과되었습니다.`,
        });
      }
    }, QUIZ_TIME_LIMIT);
  });

  socket.on("kick user", (targetNick) => {
    if (socket.id !== hostId) return;

    const targetEntry = Object.entries(users).find(
      ([, u]) => u.nickname === targetNick
    );
    if (targetEntry) {
      const [targetSocketId] = targetEntry;
      bannedNicknames.add(targetNick);
      io.to(targetSocketId).emit("kick");
      io.sockets.sockets.get(targetSocketId)?.disconnect();
    }
  });

  socket.on("disconnect", () => {
    delete users[socket.id];
    io.emit("user list", Object.values(users));
    io.emit("user count", Object.keys(users).length);

    if (socket.id === hostId) {
      const remainingIds = Object.keys(users);
      hostId = remainingIds.length > 0 ? remainingIds[0] : null;
      if (hostId) {
        io.to(hostId).emit("host status", { isHost: true });
      }
    }
  });
});

function broadcastLeaderboard() {
  const sorted = Object.entries(scores)
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score);

  const withRank = sorted.map((entry, i) => {
    const sameScoreCount = sorted.filter((e) => e.score === entry.score).length;
    const rank = sorted.findIndex((e) => e.score === entry.score) + 1;
    return { ...entry, rank };
  });

  io.emit("quiz leaderboard", withRank);
}

server.listen(3001, () => {
  console.log("✅ 서버 실행 중 http://localhost:3001");
});

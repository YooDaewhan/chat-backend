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

let users = {}; // socket.id -> {nickname, color}
let scores = {}; // nickname -> score
let bannedNicknames = new Set();
let hostId = null;

let quizHistory = [];
let quizCounter = 0;

io.on("connection", (socket) => {
  const sendUserList = () => {
    io.emit("user list", {
      users: Object.values(users),
      hostNickname: users[hostId]?.nickname || null,
    });
  };

  // 닉네임 설정
  socket.on("set nickname", ({ nickname, color }) => {
    /*if (bannedNicknames.has(nickname)) {
      socket.emit("banned", "해당 닉네임은 차단되었습니다.");
      socket.disconnect();
      return;
    }
    */
    users[socket.id] = { nickname, color };

    // 방장 지정
    if (!hostId) {
      hostId = socket.id;
    }
    socket.emit("host status", { isHost: socket.id === hostId });

    sendUserList();
    io.emit("user count", Object.keys(users).length);
  });

  // 퀴즈 출제
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
      nickname: `[문제${quiz.id}]`,
      color: "#d9534f",
      message: question,
    });

    // 현재 미해결 문제 목록 전송
    io.emit(
      "active quizzes",
      quizHistory.filter((q) => !q.solved)
    );

    // 타이머 종료 처리
    setTimeout(() => {
      if (!quiz.solved) {
        quiz.solved = true;
        io.emit("chat message", {
          nickname: "[시스템]",
          color: "#888",
          message: `[문제${quiz.id}] 시간 초과! 정답: ${quiz.answer}`,
        });
        io.emit(
          "active quizzes",
          quizHistory.filter((q) => !q.solved)
        );
      }
    }, 30 * 1000);
  });

  // 채팅 메시지
  socket.on("chat message", (msg) => {
    const user = users[socket.id] || { nickname: "익명", color: "#000000" };
    const trimmed = msg.trim().toLowerCase();

    // /방장 → 방장 강제 요청
    if (msg.trim() === "/방장") {
      hostId = socket.id;
      io.to(socket.id).emit("host status", { isHost: true });
      sendUserList();
      return;
    }

    // 정답 처리
    const unsolved = quizHistory.find((q) => !q.solved && trimmed === q.answer);
    if (unsolved) {
      unsolved.solved = true;
      scores[user.nickname] = (scores[user.nickname] || 0) + 1;

      io.emit("quiz correct", {
        nickname: user.nickname,
        color: user.color,
        answer: unsolved.answer,
        questionId: unsolved.id,
      });

      io.emit(
        "active quizzes",
        quizHistory.filter((q) => !q.solved)
      );

      // 순위 정렬
      const ranks = Object.entries(scores)
        .map(([name, score]) => ({ name, score }))
        .sort((a, b) => b.score - a.score)
        .map((entry, i, arr) => {
          const same = arr.filter((e) => e.score === entry.score).length;
          return { ...entry, rank: same > 1 ? "공동" : i + 1 };
        });

      io.emit("quiz leaderboard", ranks);
    } else {
      io.emit("chat message", {
        nickname: user.nickname,
        color: user.color,
        message: msg,
      });
    }
  });

  // 유저 킥
  socket.on("kick user", (targetNickname) => {
    if (socket.id !== hostId) return;

    const targetId = Object.entries(users).find(
      ([id, u]) => u.nickname === targetNickname
    )?.[0];
    if (targetId) {
      bannedNicknames.add(targetNickname);
      io.to(targetId).emit("kick");
      io.sockets.sockets.get(targetId)?.disconnect();
    }
  });

  // 방장 위임
  socket.on("delegate host", (targetNickname) => {
    if (socket.id !== hostId) return;

    const targetId = Object.entries(users).find(
      ([id, u]) => u.nickname === targetNickname
    )?.[0];
    if (targetId) {
      hostId = targetId;
      io.to(targetId).emit("host status", { isHost: true });
      sendUserList();
    }
  });

  // 강제 방장 가져오기
  socket.on("force host", () => {
    hostId = socket.id;
    io.to(socket.id).emit("host status", { isHost: true });
    sendUserList();
  });

  // 연결 종료
  socket.on("disconnect", () => {
    delete users[socket.id];
    if (socket.id === hostId) {
      hostId = Object.keys(users)[0] || null;
    }
    sendUserList();
    io.emit("user count", Object.keys(users).length);
  });
});

server.listen(3001, () => {
  console.log("✅ 서버 실행 중: http://localhost:3001");
});

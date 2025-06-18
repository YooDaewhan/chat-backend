const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

let users = {}; // socket.id -> { nickname, color }
let scores = {}; // socket.id -> 점수
let quizHistory = []; // {id, question, answer, solved, ...}
let quizCounter = 0;
let hostId = null;

function sendUserList() {
  io.emit("user list", users);
  io.emit("host status", { hostId });
}

io.on("connection", (socket) => {
  // 닉네임/색상 설정 및 최초 입장
  socket.on("set nickname", ({ nickname, color }) => {
    users[socket.id] = { nickname, color };
    if (!hostId) hostId = socket.id; // 유저 한 명일 때는 무조건 방장
    sendUserList();
    socket.emit("userId", socket.id);
    io.emit("user count", Object.keys(users).length);
  });

  // 채팅 메시지
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
        message: `[정답] ${user.nickname}님이 [문제${unsolved.id}]의 정답 [${unsolved.answer}]를 맞췄습니다!`,
      });

      io.emit(
        "active quizzes",
        quizHistory.filter((q) => !q.solved)
      );

      // 랭킹: 오직 socket.id만 포함
      const leaderboard = Object.entries(scores)
        .map(([sid, score]) => ({ sid, score }))
        .sort((a, b) => b.score - a.score);
      io.emit("quiz leaderboard", leaderboard);
    } else {
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
          message: `[문제${quiz.id}] 시간 초과! 정답: [${quiz.answer}]`,
        });
        io.emit(
          "active quizzes",
          quizHistory.filter((q) => !q.solved)
        );
      }
    }, 30 * 1000);
  });

  // 방장 강제 획득 (ex: /방장 커맨드)
  socket.on("force host", () => {
    hostId = socket.id;
    sendUserList();
  });

  // 방장 위임 (방장만 가능)
  socket.on("delegate host", (targetId) => {
    if (socket.id !== hostId) return;
    if (!users[targetId]) return;
    hostId = targetId;
    sendUserList();
  });

  // 강퇴 (방장만 가능)
  socket.on("kick user", (targetId) => {
    if (socket.id !== hostId) return;
    if (!users[targetId]) return;
    io.to(targetId).emit("kick");
    io.sockets.sockets.get(targetId)?.disconnect();
    // hostId 바뀔 필요는 없음(강퇴당한 유저가 방장이었으면 밑에서 처리)
  });

  // 연결 종료
  socket.on("disconnect", () => {
    delete users[socket.id];
    delete scores[socket.id];
    // 방장 퇴장 시 다음 유저에게 방장 자동 위임
    if (hostId === socket.id) {
      hostId = Object.keys(users)[0] || null;
      sendUserList();
    } else {
      // 다른 유저 퇴장 시에도 hostId 재전송(프론트 sync 위해)
      sendUserList();
    }
    io.emit("user count", Object.keys(users).length);
  });
});

server.listen(3001, () => {
  console.log("✅ 서버 실행 중: http://localhost:3001");
});

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

// ========== 이미지 업로드 설정 ==========
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB 제한
  fileFilter: (req, file, cb) => {
    // 이미지 파일만 허용
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("이미지 파일만 업로드 가능합니다."), false);
    }
    cb(null, true);
  },
});

// 업로드 폴더 static 서빙
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// 이미지 업로드 라우터
app.post("/upload", upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "파일이 없습니다." });
  }
  // 업로드된 이미지 접근 경로 반환
  const imageUrl = `/uploads/${req.file.filename}`;
  res.json({ url: imageUrl });
});

// ========== 채팅 소켓 ==========
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
    if (!hostId) hostId = socket.id;
    sendUserList();
    socket.emit("userId", socket.id);
    io.emit("user count", Object.keys(users).length);
  });

  // 채팅 메시지
  socket.on("chat message", (msg) => {
    console.log(`[MSG][${socket.id}]`, msg);

    // 이미지는 문자열로 URL만 받음 (프론트에서 전송)
    if (
      typeof msg === "string" &&
      (msg.startsWith("/uploads/") || msg.startsWith("http"))
    ) {
      io.emit("chat message", { senderId: socket.id, message: msg });
      return;
    }

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
  });

  // 연결 종료
  socket.on("disconnect", () => {
    delete users[socket.id];
    delete scores[socket.id];
    if (hostId === socket.id) {
      hostId = Object.keys(users)[0] || null;
      sendUserList();
    } else {
      sendUserList();
    }
    io.emit("user count", Object.keys(users).length);
  });
});

server.listen(3001, () => {
  console.log("✅ 서버 실행 중: http://localhost:3001");
});

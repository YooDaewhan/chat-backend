// 기존 코드 ======================
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const path = require("path");
const mysql = require("mysql2/promise");
// DB 커넥션 풀 설정
const pool = mysql.createPool({
  host: "ec2-13-125-238-80.ap-northeast-2.compute.amazonaws.com",
  user: "ydh960823", // EC2 DB 계정
  password: "Adbtmddyd2!", // EC2 DB 비번
  database: "noble", // DB명
  port: 3306,
  ssl: false,
});

const app = express();
const server = http.createServer(app);
app.use(cors({ origin: "*" }));
app.use(express.json()); // JSON POST 받을 때 필수

const io = new Server(server, {
  cors: { origin: "*" },
});

// 이미지 업로드 설정 ==================
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("이미지 파일만 업로드 가능합니다."), false);
    }
    cb(null, true);
  },
});

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.post("/upload", upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "파일이 없습니다." });
  }
  const imageUrl = `/uploads/${req.file.filename}`;
  res.json({ url: imageUrl });
});

// 소켓 ==============================
let users = {};
let scores = {};
let quizHistory = [];
let quizCounter = 0;
let hostId = null;

function sendUserList() {
  io.emit("user list", users);
  io.emit("host status", { hostId });
}

io.on("connection", (socket) => {
  socket.on("set nickname", ({ nickname, color }) => {
    users[socket.id] = { nickname, color };
    if (!hostId) hostId = socket.id;
    sendUserList();
    socket.emit("userId", socket.id);
    io.emit("user count", Object.keys(users).length);
  });

  socket.on("chat message", (msg) => {
    console.log(`[MSG][${socket.id}]`, msg);

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

  socket.on("force host", () => {
    hostId = socket.id;
    sendUserList();
  });

  socket.on("delegate host", (targetId) => {
    if (socket.id !== hostId) return;
    if (!users[targetId]) return;
    hostId = targetId;
    sendUserList();
  });

  socket.on("kick user", (targetId) => {
    if (socket.id !== hostId) return;
    if (!users[targetId]) return;
    io.to(targetId).emit("kick");
    io.sockets.sockets.get(targetId)?.disconnect();
  });

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

// ✅ 여기부터 회원가입 API 추가 ===================
app.post("/api/register", async (req, res) => {
  const { id, password } = req.body;

  if (!id || !password) {
    return res.status(400).json({ error: "id와 password는 필수입니다." });
  }

  try {
    const [result] = await pool.query(
      "INSERT INTO user (id, pw) VALUES (?, ?)",
      [id, password]
    );

    res.json({ message: "회원가입 성공", result });
  } catch (err) {
    console.error("DB 저장 실패:", err);
    res.status(500).json({ error: "DB 저장 실패: " + err.message });
  }
});

app.post("/api/login", async (req, res) => {
  const { id, password } = req.body;

  if (!id || !password) {
    return res.status(400).json({ error: "id와 password 필수" });
  }

  try {
    const [rows] = await pool.query("SELECT * FROM user WHERE id=? AND pw=?", [
      id,
      password,
    ]);

    if (rows.length === 0) {
      return res
        .status(401)
        .json({ error: "로그인 실패: 아이디 또는 비밀번호 불일치" });
    }

    res.json({ message: "로그인 성공" });
  } catch (err) {
    console.error("DB 로그인 에러:", err);
    res.status(500).json({ error: "DB 오류" });
  }
});

app.get("/api/monsters/all", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT uid, name, mid FROM monster");
    res.json(rows);
  } catch (err) {
    console.error("전체 몬스터 조회 실패:", err);
    res.status(500).json({ error: "DB 조회 실패" });
  }
});

app.get("/api/monsters/my", async (req, res) => {
  const userId = req.query.id;

  if (!userId) {
    return res.status(400).json({ error: "id 파라미터가 필요합니다." });
  }

  try {
    const [rows] = await pool.query(
      "SELECT uid, name ,mid FROM monster WHERE uid = ?",
      [userId]
    );
    res.json(rows);
  } catch (err) {
    console.error("내 몬스터 조회 실패:", err);
    res.status(500).json({ error: "DB 조회 실패" });
  }
});
app.post("/api/monsters/create", async (req, res) => {
  const { uid, name, kind, info, skil1, skil2, skil3, skil4 } = req.body;

  if (!uid || !name || !kind || !info) {
    return res.status(400).json({ error: "필수값 누락" });
  }

  try {
    const [result] = await pool.query(
      "INSERT INTO monster (uid, name, kind, info, skil1, skil2, skil3, skil4) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [uid, name, kind, info, skil1, skil2, skil3, skil4]
    );
    res.json({ message: "몬스터 생성 성공", result });
  } catch (err) {
    console.error("몬스터 생성 실패:", err);
    res.status(500).json({ error: "DB 저장 실패: " + err.message });
  }
});
app.get("/api/monsters/detail", async (req, res) => {
  const mid = req.query.mid;

  if (!mid) {
    return res.status(400).json({ error: "mid 파라미터 필요" });
  }

  try {
    const [rows] = await pool.query("SELECT * FROM monster WHERE mid = ?", [
      mid,
    ]);
    if (rows.length === 0) {
      return res.status(404).json({ error: "해당 몬스터 없음" });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error("몬스터 상세 조회 실패:", err);
    res.status(500).json({ error: "DB 조회 실패" });
  }
});

app.get("/api/monsters/detail", async (req, res) => {
  const { mid } = req.query;
  if (!mid) return res.status(400).json({ error: "mid 파라미터 필요" });

  try {
    const [rows] = await pool.query("SELECT * FROM monster WHERE mid = ?", [
      mid,
    ]);
    if (rows.length === 0) {
      return res.status(404).json({ error: "해당 몬스터 없음" });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error("몬스터 상세 조회 실패:", err);
    res.status(500).json({ error: "DB 조회 실패" });
  }
});

app.post("/api/story/create", async (req, res) => {
  const { uid, storyinfo, storytext } = req.body;
  if (!uid || !storyinfo || !storytext)
    return res.status(400).json({ error: "필수값 누락" });

  try {
    await pool.query(
      "INSERT INTO story (uid, storyinfo, storytext) VALUES (?, ?, ?)",
      [uid, storyinfo, storytext]
    );
    res.json({ message: "스토리 저장 성공" });
  } catch (err) {
    console.error("스토리 저장 실패:", err);
    res.status(500).json({ error: "DB 저장 실패" });
  }
});
// =========================================

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`✅ 서버 실행 중: 포트 ${PORT}`);
});

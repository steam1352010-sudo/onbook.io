// server.js
const express = require("express");
const cookieParser = require("cookie-parser");
const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "db.json");

app.use(express.json({ limit: "25mb" }));
app.use(cookieParser());
app.use(express.static(__dirname));

function emptyDB() {
  return {
    users: [],
    posts: [],
    friendRequests: [],
    friends: []
  };
}

function normalizeDB(db) {
  return {
    users: Array.isArray(db.users) ? db.users : [],
    posts: Array.isArray(db.posts) ? db.posts : [],
    friendRequests: Array.isArray(db.friendRequests) ? db.friendRequests : [],
    friends: Array.isArray(db.friends) ? db.friends : []
  };
}

async function readDB() {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    return normalizeDB(JSON.parse(raw));
  } catch {
    const db = emptyDB();
    await writeDB(db);
    return db;
  }
}

async function writeDB(db) {
  await fs.writeFile(DATA_FILE, JSON.stringify(normalizeDB(db), null, 2), "utf8");
}

function randomUserCode(length = 12) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function generateUsername() {
  return `user_${randomUserCode(12)}`;
}

function defaultAvatar(username) {
  const letter = (username || "?").trim().charAt(0).toUpperCase();
  const colors = ["#1877f2", "#42b72a", "#f02849", "#f7b928", "#8e44ad", "#16a085"];
  const color = colors[letter.charCodeAt(0) % colors.length];
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'>
    <rect width='100%' height='100%' fill='${color}'/>
    <text x='50%' y='55%' font-size='60' fill='#fff' text-anchor='middle' font-family='Arial' dy='.1em'>${letter}</text>
  </svg>`;
  return "data:image/svg+xml;base64," + Buffer.from(unescape(encodeURIComponent(svg))).toString("base64");
}

async function createGuestIfNeeded(req, res) {
  const db = await readDB();
  const visitorId = req.cookies.onbook_uid;

  let me = db.users.find(u => u.id === visitorId && !u.suspended);
  if (!me) {
    me = {
      id: randomUUID(),
      username: generateUsername(),
      bio: "",
      avatar: defaultAvatar("U"),
      suspended: false,
      suspendReason: "",
      createdAt: Date.now()
    };

    db.users.unshift(me);
    await writeDB(db);

    res.cookie("onbook_uid", me.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: false
    });
  }

  return { db, me };
}

app.get("/api/bootstrap", async (req, res) => {
  try {
    const { db, me } = await createGuestIfNeeded(req, res);
    res.json({ me, ...db });
  } catch (err) {
    res.status(500).send("bootstrap failed");
  }
});

app.get("/api/me", async (req, res) => {
  try {
    const { me } = await createGuestIfNeeded(req, res);
    res.json(me);
  } catch {
    res.status(500).send("failed");
  }
});

app.get("/api/users/:id", async (req, res) => {
  try {
    const db = await readDB();
    const user = db.users.find(u => u.id === req.params.id) || null;
    res.json(user);
  } catch {
    res.status(500).send("failed");
  }
});

app.put("/api/users", async (req, res) => {
  try {
    const db = await readDB();
    db.users = normalizeDB({ users: req.body }).users;
    await writeDB(db);
    res.json({ ok: true });
  } catch {
    res.status(500).send("failed");
  }
});

app.put("/api/posts", async (req, res) => {
  try {
    const db = await readDB();
    db.posts = normalizeDB({ posts: req.body }).posts;
    await writeDB(db);
    res.json({ ok: true });
  } catch {
    res.status(500).send("failed");
  }
});

app.put("/api/friend-requests", async (req, res) => {
  try {
    const db = await readDB();
    db.friendRequests = normalizeDB({ friendRequests: req.body }).friendRequests;
    await writeDB(db);
    res.json({ ok: true });
  } catch {
    res.status(500).send("failed");
  }
});

app.put("/api/friends", async (req, res) => {
  try {
    const db = await readDB();
    db.friends = normalizeDB({ friends: req.body }).friends;
    await writeDB(db);
    res.json({ ok: true });
  } catch {
    res.status(500).send("failed");
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`On Book running on http://localhost:${PORT}`);
});

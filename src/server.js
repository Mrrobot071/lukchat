const crypto = require("node:crypto");
const http = require("node:http");
const path = require("node:path");

require("dotenv").config({
  path: path.resolve(__dirname, "..", ".env"),
  quiet: true,
});

const bcrypt = require("bcryptjs");
const cookie = require("cookie");
const cookieParser = require("cookie-parser");
const express = require("express");
const { rateLimit } = require("express-rate-limit");
const helmet = require("helmet");
const { Server } = require("socket.io");

const database = require("./database");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const COOKIE_NAME = "hot_chat_session";
const SESSION_HOURS = Math.min(
  Math.max(Number(process.env.SESSION_TTL_HOURS || 6), 1),
  168,
);
const SESSION_MS = SESSION_HOURS * 60 * 60 * 1000;
const MESSAGE_LIMIT = Math.min(
  Math.max(Number(process.env.MESSAGE_LIMIT_PER_ROOM || 1000), 100),
  10_000,
);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 10) {
  console.error(
    "ADMIN_PASSWORD ausente ou muito curta. Execute `npm run setup` antes de iniciar.",
  );
  process.exit(1);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 12_000,
  serveClient: true,
  transports: ["websocket", "polling"],
});

const cookieOptions = {
  httpOnly: true,
  sameSite: "strict",
  secure: process.env.COOKIE_SECURE === "true",
  maxAge: SESSION_MS,
  path: "/",
};

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function safeEqual(left, right) {
  const leftHash = crypto.createHash("sha256").update(String(left)).digest();
  const rightHash = crypto.createHash("sha256").update(String(right)).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function normalizeText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, maxLength);
}

function toSlug(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 42);
}

function getTokenHash(rawCookie) {
  if (!rawCookie || typeof rawCookie !== "string" || rawCookie.length > 256) {
    return null;
  }
  return sha256(rawCookie);
}

function sessionFromRawToken(rawToken) {
  const tokenHash = getTokenHash(rawToken);
  if (!tokenHash) return null;
  const session = database.getSession(tokenHash);
  return session ? { ...session, tokenHash } : null;
}

function sessionFromRequest(req) {
  return sessionFromRawToken(req.cookies?.[COOKIE_NAME]);
}

function issueSession(req, res, displayName) {
  const current = sessionFromRequest(req);
  const expiresAt = new Date(Date.now() + SESSION_MS).toISOString();

  if (current) {
    database.updateSession(current.tokenHash, displayName, expiresAt);
    return { ...current, display_name: displayName, expires_at: expiresAt };
  }

  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = sha256(rawToken);
  const session = database.createSession({
    tokenHash,
    userId: crypto.randomUUID(),
    displayName,
    expiresAt,
  });
  res.cookie(COOKIE_NAME, rawToken, cookieOptions);
  return { ...session, tokenHash };
}

function requireRoomSession(req, res, roomId) {
  const session = sessionFromRequest(req);
  if (!session) {
    res.status(401).json({ error: "Sua sessão expirou. Entre novamente." });
    return null;
  }
  if (!database.hasRoomAccess(session.tokenHash, roomId)) {
    res.status(403).json({ error: "Esta sala está bloqueada." });
    return null;
  }
  return session;
}

function hasAdminPassword(value) {
  return typeof value === "string" && safeEqual(value, ADMIN_PASSWORD);
}

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "ws:", "wss:"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(express.json({ limit: "20kb" }));
app.use(cookieParser());

app.use("/api", (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();

  const origin = req.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== req.get("host")) {
        return res.status(403).json({ error: "Origem não autorizada." });
      }
    } catch {
      return res.status(403).json({ error: "Origem inválida." });
    }
  }

  if (!req.is("application/json")) {
    return res.status(415).json({ error: "Envie os dados como JSON." });
  }
  next();
});

const unlockLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Muitas tentativas. Aguarde alguns minutos." },
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Muitas tentativas administrativas." },
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "hot-chat" });
});

app.get("/api/session", (req, res) => {
  const session = sessionFromRequest(req);
  res.json({
    authenticated: Boolean(session),
    displayName: session?.display_name || null,
    userId: session?.user_id || null,
    expiresAt: session?.expires_at || null,
  });
});

app.get("/api/rooms", (req, res) => {
  const session = sessionFromRequest(req);
  res.json({
    rooms: database.listRooms(session?.tokenHash),
    displayName: session?.display_name || null,
  });
});

app.post("/api/rooms/:roomId/unlock", unlockLimiter, async (req, res) => {
  const room = database.getRoom(req.params.roomId);
  if (!room) return res.status(404).json({ error: "Sala não encontrada." });

  const displayName = normalizeText(req.body?.displayName, 32);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (displayName.length < 2) {
    return res.status(400).json({ error: "Informe um nome com pelo menos 2 caracteres." });
  }
  if (!password || !(await bcrypt.compare(password, room.password_hash))) {
    return res.status(401).json({ error: "Senha da sala incorreta." });
  }

  const session = issueSession(req, res, displayName);
  database.unlockRoom(session.tokenHash, room.id, room.auth_version);
  res.json({
    ok: true,
    room: { id: room.id, name: room.name, description: room.description },
    displayName,
    expiresInHours: SESSION_HOURS,
  });
});

app.post("/api/logout", (req, res) => {
  const session = sessionFromRequest(req);
  if (session) database.deleteSession(session.tokenHash);
  res.clearCookie(COOKIE_NAME, cookieOptions);
  res.json({ ok: true });
});

app.get("/api/rooms/:roomId/messages", (req, res) => {
  const roomId = req.params.roomId;
  if (!requireRoomSession(req, res, roomId)) return;

  const beforeCandidate = Number(req.query.before);
  const before = Number.isSafeInteger(beforeCandidate) && beforeCandidate > 0
    ? beforeCandidate
    : Number.MAX_SAFE_INTEGER;
  const limitCandidate = Number(req.query.limit);
  const limit = Number.isSafeInteger(limitCandidate)
    ? Math.min(Math.max(limitCandidate, 10), 100)
    : 50;
  res.json({ messages: database.listMessages(roomId, before, limit) });
});

app.post("/api/rooms", adminLimiter, async (req, res) => {
  if (!hasAdminPassword(req.body?.adminPassword)) {
    return res.status(401).json({ error: "Senha administrativa incorreta." });
  }

  const name = normalizeText(req.body?.name, 40);
  const description = normalizeText(req.body?.description, 90);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (name.length < 2) {
    return res.status(400).json({ error: "O nome da sala é muito curto." });
  }
  if (password.length < 6 || password.length > 128) {
    return res.status(400).json({ error: "A senha deve ter entre 6 e 128 caracteres." });
  }

  const baseId = toSlug(name) || "sala";
  let roomId = baseId;
  let suffix = 2;
  while (database.getRoom(roomId)) roomId = `${baseId}-${suffix++}`;

  const room = database.createRoom({
    id: roomId,
    name,
    description,
    passwordHash: await bcrypt.hash(password, 12),
  });
  io.emit("rooms_changed");
  res.status(201).json({
    room: { id: room.id, name: room.name, description: room.description },
  });
});

app.patch("/api/rooms/:roomId", adminLimiter, async (req, res) => {
  if (!hasAdminPassword(req.body?.adminPassword)) {
    return res.status(401).json({ error: "Senha administrativa incorreta." });
  }
  const current = database.getRoom(req.params.roomId);
  if (!current) return res.status(404).json({ error: "Sala não encontrada." });

  const name = normalizeText(req.body?.name || current.name, 40);
  const description = normalizeText(
    req.body?.description ?? current.description,
    90,
  );
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (name.length < 2) {
    return res.status(400).json({ error: "O nome da sala é muito curto." });
  }
  if (password && (password.length < 6 || password.length > 128)) {
    return res.status(400).json({ error: "A nova senha deve ter entre 6 e 128 caracteres." });
  }

  const room = database.updateRoom({
    id: current.id,
    name,
    description,
    passwordHash: password ? await bcrypt.hash(password, 12) : null,
  });

  if (password) lockRoomSockets(room.id);
  io.emit("rooms_changed");
  res.json({
    room: { id: room.id, name: room.name, description: room.description },
    passwordChanged: Boolean(password),
  });
});

app.delete("/api/rooms/:roomId/messages", adminLimiter, (req, res) => {
  if (!hasAdminPassword(req.body?.adminPassword)) {
    return res.status(401).json({ error: "Senha administrativa incorreta." });
  }
  const room = database.getRoom(req.params.roomId);
  if (!room) return res.status(404).json({ error: "Sala não encontrada." });

  database.clearMessages(room.id);
  io.to(roomChannel(room.id)).emit("messages_cleared", { roomId: room.id });
  io.emit("rooms_changed");
  res.json({ ok: true });
});

app.use(
  express.static(path.resolve(__dirname, "..", "public"), {
    extensions: ["html"],
    maxAge: process.env.NODE_ENV === "production" ? "1h" : 0,
  }),
);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Rota não encontrada." });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "O servidor encontrou um erro inesperado." });
});

const onlineByRoom = new Map();

function roomChannel(roomId) {
  return `room:${roomId}`;
}

function presenceCount(roomId) {
  const connections = onlineByRoom.get(roomId);
  return connections ? new Set(connections.values()).size : 0;
}

function emitPresence(roomId) {
  io.to(roomChannel(roomId)).emit("room_presence", {
    roomId,
    count: presenceCount(roomId),
  });
}

function leaveCurrentRoom(socket) {
  const roomId = socket.data.currentRoom;
  if (!roomId) return;

  socket.leave(roomChannel(roomId));
  const connections = onlineByRoom.get(roomId);
  if (connections) {
    connections.delete(socket.id);
    if (!connections.size) onlineByRoom.delete(roomId);
  }
  socket.data.currentRoom = null;
  emitPresence(roomId);
}

function lockRoomSockets(roomId) {
  io.to(roomChannel(roomId)).emit("room_locked", { roomId });
  const sockets = io.sockets.adapter.rooms.get(roomChannel(roomId));
  if (sockets) {
    for (const socketId of [...sockets]) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket?.data.currentRoom === roomId) leaveCurrentRoom(socket);
    }
  }
  onlineByRoom.delete(roomId);
}

io.use((socket, next) => {
  try {
    const cookies = cookie.parse(socket.handshake.headers.cookie || "");
    const session = sessionFromRawToken(cookies[COOKIE_NAME]);
    if (!session) return next(new Error("unauthorized"));
    socket.data.tokenHash = session.tokenHash;
    socket.data.userId = session.user_id;
    socket.data.displayName = session.display_name;
    next();
  } catch {
    next(new Error("unauthorized"));
  }
});

io.on("connection", (socket) => {
  socket.on("join_room", ({ roomId } = {}, acknowledge = () => {}) => {
    const room = typeof roomId === "string" ? database.getRoom(roomId) : null;
    const session = database.getSession(socket.data.tokenHash);
    if (
      !room ||
      !session ||
      !database.hasRoomAccess(socket.data.tokenHash, room.id)
    ) {
      return acknowledge({ ok: false, error: "Sala bloqueada ou sessão expirada." });
    }

    leaveCurrentRoom(socket);
    socket.data.currentRoom = room.id;
    socket.data.displayName = session.display_name;
    socket.join(roomChannel(room.id));

    if (!onlineByRoom.has(room.id)) onlineByRoom.set(room.id, new Map());
    onlineByRoom.get(room.id).set(socket.id, session.user_id);
    emitPresence(room.id);
    acknowledge({ ok: true, online: presenceCount(room.id) });
  });

  socket.on("send_message", ({ roomId, text } = {}, acknowledge = () => {}) => {
    const cleanedText = normalizeText(text, 2000);
    const now = Date.now();
    socket.data.messageTimes = (socket.data.messageTimes || []).filter(
      (timestamp) => now - timestamp < 10_000,
    );

    if (socket.data.messageTimes.length >= 8) {
      return acknowledge({ ok: false, error: "Você está enviando rápido demais." });
    }
    if (!cleanedText) {
      return acknowledge({ ok: false, error: "A mensagem está vazia." });
    }
    if (
      roomId !== socket.data.currentRoom ||
      !database.hasRoomAccess(socket.data.tokenHash, roomId)
    ) {
      return acknowledge({ ok: false, error: "Você não tem acesso a esta sala." });
    }

    const session = database.getSession(socket.data.tokenHash);
    if (!session) {
      return acknowledge({ ok: false, error: "Sua sessão expirou." });
    }

    socket.data.messageTimes.push(now);
    const message = database.createMessage({
      roomId,
      userId: session.user_id,
      username: session.display_name,
      text: cleanedText,
      limit: MESSAGE_LIMIT,
    });
    io.to(roomChannel(roomId)).emit("new_message", message);
    io.to(roomChannel(roomId)).emit("room_preview", {
      roomId,
      latestMessage: {
        id: message.id,
        username: message.username,
        text: message.text,
        createdAt: message.created_at,
      },
    });
    acknowledge({ ok: true, id: message.id });
  });

  socket.on("typing", ({ roomId, isTyping } = {}) => {
    if (
      roomId !== socket.data.currentRoom ||
      !database.hasRoomAccess(socket.data.tokenHash, roomId)
    ) return;
    socket.to(roomChannel(roomId)).emit("user_typing", {
      roomId,
      username: socket.data.displayName,
      isTyping: Boolean(isTyping),
    });
  });

  socket.on("leave_room", () => leaveCurrentRoom(socket));
  socket.on("disconnect", () => leaveCurrentRoom(socket));
});

async function bootstrap() {
  database.deleteExpiredSessions();

  if (database.roomCount() === 0) {
    const password = process.env.DEFAULT_ROOM_PASSWORD;
    if (!password || password.length < 6) {
      throw new Error(
        "DEFAULT_ROOM_PASSWORD ausente ou curta. Execute `npm run setup`.",
      );
    }
    database.createRoom({
      id: "geral",
      name: normalizeText(process.env.DEFAULT_ROOM_NAME || "Geral", 40),
      description: normalizeText(
        process.env.DEFAULT_ROOM_DESCRIPTION || "Conversa principal",
        90,
      ),
      passwordHash: await bcrypt.hash(password, 12),
    });
  }

  setInterval(() => database.deleteExpiredSessions(), 60 * 60 * 1000).unref();

  server.listen(PORT, HOST, () => {
    const displayHost = HOST === "0.0.0.0" ? "localhost" : HOST;
    console.log(`Hot Chat disponível em http://${displayHost}:${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

function shutdown() {
  io.close();
  server.close(() => {
    database.db.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

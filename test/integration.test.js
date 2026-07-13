const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { after, before, test } = require("node:test");
const { io } = require("socket.io-client");

const port = 31_000 + Math.floor(Math.random() * 1_000);
const baseUrl = `http://127.0.0.1:${port}`;
const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "hot-chat-test-"));
const roomPassword = "senha-geral-teste";
const adminPassword = "admin-teste-super-segura";
let serverProcess;
let sessionCookie = "";
let socket;

async function request(url, options = {}, cookie = sessionCookie) {
  const headers = { ...(options.headers || {}) };
  if (options.body && typeof options.body !== "string") {
    headers["content-type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${baseUrl}${url}`, { ...options, headers });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) sessionCookie = setCookie.split(";")[0];
  const body = await response.json();
  return { response, body };
}

async function waitForServer() {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("O servidor de teste não iniciou a tempo.");
}

before(async () => {
  serverProcess = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "src/server.js"], {
    cwd: path.resolve(__dirname, ".."),
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      ADMIN_PASSWORD: adminPassword,
      DEFAULT_ROOM_PASSWORD: roomPassword,
      DEFAULT_ROOM_NAME: "Geral",
      DEFAULT_ROOM_DESCRIPTION: "Sala de teste",
      DATA_FILE: path.join(tempDirectory, "test.db"),
      COOKIE_SECURE: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForServer();
});

after(async () => {
  if (socket) socket.disconnect();
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill("SIGTERM");
    await new Promise((resolve) => serverProcess.once("exit", resolve));
  }
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

test("lista salas sem expor mensagens ou senhas", async () => {
  const { response, body } = await request("/api/rooms", {}, "");
  assert.equal(response.status, 200);
  assert.equal(body.rooms.length, 1);
  assert.equal(body.rooms[0].unlocked, false);
  assert.equal(body.rooms[0].latestMessage, null);
  assert.equal(JSON.stringify(body).includes(roomPassword), false);
});

test("rejeita senha errada e aceita a senha da sala no servidor", async () => {
  const wrong = await request(
    "/api/rooms/geral/unlock",
    { method: "POST", body: { displayName: "Pessoa Teste", password: "errada" } },
    "",
  );
  assert.equal(wrong.response.status, 401);

  const correct = await request(
    "/api/rooms/geral/unlock",
    { method: "POST", body: { displayName: "Pessoa Teste", password: roomPassword } },
    "",
  );
  assert.equal(correct.response.status, 200);
  assert.match(sessionCookie, /^hot_chat_session=/);
  assert.match(correct.response.headers.get("set-cookie"), /HttpOnly/i);
  assert.match(correct.response.headers.get("set-cookie"), /SameSite=Strict/i);
});

test("sessão liberada acessa a sala e envia em tempo real", async () => {
  const session = await request("/api/session");
  assert.equal(session.body.authenticated, true);
  assert.ok(session.body.userId);

  const messages = await request("/api/rooms/geral/messages");
  assert.equal(messages.response.status, 200);
  assert.deepEqual(messages.body.messages, []);

  socket = io(baseUrl, {
    transports: ["websocket"],
    extraHeaders: { Cookie: sessionCookie },
  });
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });

  const joined = await new Promise((resolve) => {
    socket.emit("join_room", { roomId: "geral" }, resolve);
  });
  assert.equal(joined.ok, true);

  const receivedPromise = new Promise((resolve) => socket.once("new_message", resolve));
  const sent = await new Promise((resolve) => {
    socket.emit("send_message", { roomId: "geral", text: "Olá em tempo real" }, resolve);
  });
  const received = await receivedPromise;
  assert.equal(sent.ok, true);
  assert.equal(received.text, "Olá em tempo real");
  assert.equal(received.username, "Pessoa Teste");
});

test("visitante não autorizado não recebe a prévia da mensagem", async () => {
  const anonymous = await request("/api/rooms", {}, "");
  assert.equal(anonymous.body.rooms[0].unlocked, false);
  assert.equal(anonymous.body.rooms[0].latestMessage, null);

  const authorized = await request("/api/rooms");
  assert.equal(authorized.body.rooms[0].unlocked, true);
  assert.equal(authorized.body.rooms[0].latestMessage.text, "Olá em tempo real");
});

test("cada nova sala usa sua própria senha", async () => {
  const created = await request("/api/rooms", {
    method: "POST",
    body: {
      name: "Equipe",
      description: "Sala separada",
      password: "senha-equipe-unica",
      adminPassword,
    },
  });
  assert.equal(created.response.status, 201);

  const wrongRoomPassword = await request(
    "/api/rooms/equipe/unlock",
    { method: "POST", body: { displayName: "Pessoa Teste", password: roomPassword } },
  );
  assert.equal(wrongRoomPassword.response.status, 401);

  const rightRoomPassword = await request(
    "/api/rooms/equipe/unlock",
    { method: "POST", body: { displayName: "Pessoa Teste", password: "senha-equipe-unica" } },
  );
  assert.equal(rightRoomPassword.response.status, 200);

  const rooms = await request("/api/rooms");
  assert.equal(rooms.body.rooms.find((room) => room.id === "equipe").unlocked, true);
});


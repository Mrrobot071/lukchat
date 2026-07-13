const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env");

if (fs.existsSync(envPath)) {
  console.log("O arquivo .env já existe. Nenhuma credencial foi alterada.");
  process.exit(0);
}

const randomPassword = (length = 14) =>
  crypto.randomBytes(length).toString("base64url").slice(0, length);

const adminPassword = randomPassword(18);
const roomPassword = randomPassword(12);

const env = [
  "PORT=3000",
  "HOST=127.0.0.1",
  "COOKIE_SECURE=false",
  "SESSION_TTL_HOURS=6",
  `ADMIN_PASSWORD=${adminPassword}`,
  "DEFAULT_ROOM_NAME=Geral",
  "DEFAULT_ROOM_DESCRIPTION=Conversa principal",
  `DEFAULT_ROOM_PASSWORD=${roomPassword}`,
  "MESSAGE_LIMIT_PER_ROOM=1000",
  "",
].join("\n");

fs.writeFileSync(envPath, env, { encoding: "utf8", mode: 0o600 });

console.log("Configuração criada com sucesso.");
console.log(`Senha administrativa: ${adminPassword}`);
console.log(`Senha da sala Geral: ${roomPassword}`);
console.log("Guarde essas senhas. Elas ficam somente no servidor (.env).\n");


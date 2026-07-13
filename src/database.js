const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const dataDirectory = path.resolve(__dirname, "..", "data");
fs.mkdirSync(dataDirectory, { recursive: true });

const databasePath = process.env.DATA_FILE
  ? path.resolve(process.env.DATA_FILE)
  : path.join(dataDirectory, "hot-chat.db");
const db = new DatabaseSync(databasePath);
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA busy_timeout = 5000");

db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    auth_version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_messages_room_id_id
    ON messages(room_id, id DESC);

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS session_rooms (
    token_hash TEXT NOT NULL,
    room_id TEXT NOT NULL,
    auth_version INTEGER NOT NULL,
    unlocked_at TEXT NOT NULL,
    PRIMARY KEY (token_hash, room_id),
    FOREIGN KEY (token_hash) REFERENCES sessions(token_hash) ON DELETE CASCADE,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
  );
`);

const statements = {
  roomCount: db.prepare("SELECT COUNT(*) AS total FROM rooms"),
  getRoom: db.prepare("SELECT * FROM rooms WHERE id = ?"),
  getRooms: db.prepare("SELECT * FROM rooms ORDER BY created_at ASC"),
  createRoom: db.prepare(`
    INSERT INTO rooms (id, name, description, password_hash, created_at)
    VALUES (?, ?, ?, ?, ?)
  `),
  updateRoom: db.prepare(`
    UPDATE rooms
    SET name = ?, description = ?, password_hash = ?, auth_version = ?
    WHERE id = ?
  `),
  latestMessage: db.prepare(`
    SELECT id, username, text, created_at
    FROM messages WHERE room_id = ? ORDER BY id DESC LIMIT 1
  `),
  messages: db.prepare(`
    SELECT id, room_id, user_id, username, text, created_at
    FROM messages
    WHERE room_id = ? AND id < ?
    ORDER BY id DESC LIMIT ?
  `),
  insertMessage: db.prepare(`
    INSERT INTO messages (room_id, user_id, username, text, created_at)
    VALUES (?, ?, ?, ?, ?)
  `),
  getMessage: db.prepare(`
    SELECT id, room_id, user_id, username, text, created_at
    FROM messages WHERE id = ?
  `),
  deleteMessages: db.prepare("DELETE FROM messages WHERE room_id = ?"),
  deleteOldMessages: db.prepare(`
    DELETE FROM messages
    WHERE room_id = ? AND id NOT IN (
      SELECT id FROM messages WHERE room_id = ? ORDER BY id DESC LIMIT ?
    )
  `),
  createSession: db.prepare(`
    INSERT INTO sessions (token_hash, user_id, display_name, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `),
  getSession: db.prepare(`
    SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?
  `),
  updateSession: db.prepare(`
    UPDATE sessions SET display_name = ?, expires_at = ? WHERE token_hash = ?
  `),
  deleteSession: db.prepare("DELETE FROM sessions WHERE token_hash = ?"),
  deleteExpiredSessions: db.prepare("DELETE FROM sessions WHERE expires_at <= ?"),
  unlockRoom: db.prepare(`
    INSERT INTO session_rooms (token_hash, room_id, auth_version, unlocked_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(token_hash, room_id) DO UPDATE SET
      auth_version = excluded.auth_version,
      unlocked_at = excluded.unlocked_at
  `),
  hasRoomAccess: db.prepare(`
    SELECT 1 AS allowed
    FROM session_rooms sr
    JOIN rooms r ON r.id = sr.room_id
    WHERE sr.token_hash = ? AND sr.room_id = ?
      AND sr.auth_version = r.auth_version
  `),
  getUnlockedRooms: db.prepare(`
    SELECT sr.room_id
    FROM session_rooms sr
    JOIN rooms r ON r.id = sr.room_id
    WHERE sr.token_hash = ? AND sr.auth_version = r.auth_version
  `),
};

function createRoom({ id, name, description, passwordHash }) {
  statements.createRoom.run(
    id,
    name,
    description,
    passwordHash,
    new Date().toISOString(),
  );
  return getRoom(id);
}

function getRoom(id) {
  return statements.getRoom.get(id) || null;
}

function listRooms(tokenHash) {
  const unlocked = new Set(
    tokenHash
      ? statements.getUnlockedRooms.all(tokenHash).map((item) => item.room_id)
      : [],
  );

  return statements.getRooms.all().map((room) => {
    const isUnlocked = unlocked.has(room.id);
    const latest = isUnlocked ? statements.latestMessage.get(room.id) : null;

    return {
      id: room.id,
      name: room.name,
      description: room.description,
      createdAt: room.created_at,
      unlocked: isUnlocked,
      latestMessage: latest
        ? {
            id: latest.id,
            username: latest.username,
            text: latest.text,
            createdAt: latest.created_at,
          }
        : null,
    };
  });
}

function updateRoom({ id, name, description, passwordHash }) {
  const room = getRoom(id);
  if (!room) return null;

  const nextHash = passwordHash || room.password_hash;
  const nextVersion = passwordHash ? room.auth_version + 1 : room.auth_version;
  statements.updateRoom.run(name, description, nextHash, nextVersion, id);
  return getRoom(id);
}

function listMessages(roomId, before = Number.MAX_SAFE_INTEGER, limit = 50) {
  return statements.messages.all(roomId, before, limit).reverse();
}

function createMessage({ roomId, userId, username, text, limit }) {
  const result = statements.insertMessage.run(
    roomId,
    userId,
    username,
    text,
    new Date().toISOString(),
  );
  statements.deleteOldMessages.run(roomId, roomId, limit);
  return statements.getMessage.get(result.lastInsertRowid);
}

function createSession({ tokenHash, userId, displayName, expiresAt }) {
  const now = new Date().toISOString();
  statements.createSession.run(tokenHash, userId, displayName, expiresAt, now);
  return statements.getSession.get(tokenHash, now);
}

module.exports = {
  db,
  statements,
  createRoom,
  getRoom,
  listRooms,
  updateRoom,
  listMessages,
  createMessage,
  createSession,
  clearMessages: (roomId) => statements.deleteMessages.run(roomId),
  getSession: (tokenHash) =>
    statements.getSession.get(tokenHash, new Date().toISOString()) || null,
  updateSession: (tokenHash, displayName, expiresAt) =>
    statements.updateSession.run(displayName, expiresAt, tokenHash),
  deleteSession: (tokenHash) => statements.deleteSession.run(tokenHash),
  deleteExpiredSessions: () =>
    statements.deleteExpiredSessions.run(new Date().toISOString()),
  unlockRoom: (tokenHash, roomId, authVersion) =>
    statements.unlockRoom.run(
      tokenHash,
      roomId,
      authVersion,
      new Date().toISOString(),
    ),
  hasRoomAccess: (tokenHash, roomId) =>
    Boolean(statements.hasRoomAccess.get(tokenHash, roomId)),
  roomCount: () => statements.roomCount.get().total,
};

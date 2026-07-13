"use strict";

const state = {
  rooms: [],
  currentRoom: null,
  messages: [],
  session: null,
  userId: null,
  socket: null,
  hasMore: false,
  loadingMessages: false,
  roomToUnlock: null,
  typingUsers: new Map(),
  typingTimer: null,
  toastTimer: null,
};

const elements = {
  appShell: document.getElementById("appShell"),
  roomsList: document.getElementById("roomsList"),
  roomCount: document.getElementById("roomCount"),
  roomSearch: document.getElementById("roomSearch"),
  profileAvatar: document.getElementById("profileAvatar"),
  profileName: document.getElementById("profileName"),
  sessionStatus: document.getElementById("sessionStatus"),
  logoutButton: document.getElementById("logoutButton"),
  newRoomButton: document.getElementById("newRoomButton"),
  emptyNewRoomButton: document.getElementById("emptyNewRoomButton"),
  emptyState: document.getElementById("emptyState"),
  chatView: document.getElementById("chatView"),
  backButton: document.getElementById("backButton"),
  chatAvatar: document.getElementById("chatAvatar"),
  chatRoomName: document.getElementById("chatRoomName"),
  chatPresence: document.getElementById("chatPresence"),
  manageRoomButton: document.getElementById("manageRoomButton"),
  connectionBanner: document.getElementById("connectionBanner"),
  messages: document.getElementById("messages"),
  loadMoreButton: document.getElementById("loadMoreButton"),
  typingStatus: document.getElementById("typingStatus"),
  messageForm: document.getElementById("messageForm"),
  messageInput: document.getElementById("messageInput"),
  sendButton: document.getElementById("sendButton"),
  emojiButton: document.getElementById("emojiButton"),
  modalBackdrop: document.getElementById("modalBackdrop"),
  unlockModal: document.getElementById("unlockModal"),
  unlockForm: document.getElementById("unlockForm"),
  unlockTitle: document.getElementById("unlockTitle"),
  unlockDescription: document.getElementById("unlockDescription"),
  displayNameInput: document.getElementById("displayNameInput"),
  roomPasswordInput: document.getElementById("roomPasswordInput"),
  unlockError: document.getElementById("unlockError"),
  createRoomModal: document.getElementById("createRoomModal"),
  createRoomForm: document.getElementById("createRoomForm"),
  createRoomError: document.getElementById("createRoomError"),
  manageRoomModal: document.getElementById("manageRoomModal"),
  manageRoomForm: document.getElementById("manageRoomForm"),
  manageRoomName: document.getElementById("manageRoomName"),
  manageRoomDescription: document.getElementById("manageRoomDescription"),
  manageRoomPassword: document.getElementById("manageRoomPassword"),
  manageAdminPassword: document.getElementById("manageAdminPassword"),
  manageRoomError: document.getElementById("manageRoomError"),
  clearMessagesButton: document.getElementById("clearMessagesButton"),
  toast: document.getElementById("toast"),
};

const avatarGradients = [
  "linear-gradient(135deg, #fc3c3c, #ff2d75)",
  "linear-gradient(135deg, #ff5c35, #fc3c7d)",
  "linear-gradient(135deg, #d72c62, #7e3cff)",
  "linear-gradient(135deg, #ff2d75, #ff7b45)",
  "linear-gradient(135deg, #a62ee8, #ff3d71)",
  "linear-gradient(135deg, #e72b3d, #ff8b3d)",
];

async function api(url, options = {}) {
  const requestOptions = { ...options };
  requestOptions.headers = { ...(options.headers || {}) };
  if (options.body && typeof options.body !== "string") {
    requestOptions.headers["Content-Type"] = "application/json";
    requestOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, requestOptions);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "Não foi possível concluir a operação.");
    error.status = response.status;
    throw error;
  }
  return payload;
}

function initials(value) {
  const words = String(value || "?").trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0][0]}${words[1][0]}` : words[0]?.slice(0, 2) || "?")
    .toUpperCase();
}

function valueHash(value) {
  let hash = 0;
  for (const character of String(value)) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function gradientFor(value) {
  return avatarGradients[valueHash(value) % avatarGradients.length];
}

function setAvatar(element, value) {
  element.textContent = initials(value);
  element.style.setProperty("--avatar-gradient", gradientFor(value));
}

function formatListTime(dateValue) {
  if (!dateValue) return "";
  const date = new Date(dateValue);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Ontem";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function formatMessageTime(dateValue) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateValue));
}

function formatDay(dateValue) {
  const date = new Date(dateValue);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Hoje";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Ontem";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  }).format(date);
}

function setProfile(session) {
  const name = session?.displayName || "Visitante";
  elements.profileName.textContent = name;
  elements.sessionStatus.textContent = session?.authenticated
    ? `Sessão segura por até ${session.expiresAt ? formatExpiration(session.expiresAt) : "6 horas"}`
    : "Entre em uma sala";
  elements.logoutButton.hidden = !session?.authenticated;
  setAvatar(elements.profileAvatar, name);
}

function formatExpiration(value) {
  const hours = Math.max(1, Math.ceil((new Date(value).getTime() - Date.now()) / 3_600_000));
  return `${hours}h`;
}

function createLockIcon(unlocked) {
  const wrap = document.createElement("span");
  wrap.className = `room-lock${unlocked ? " is-unlocked" : ""}`;
  wrap.innerHTML = unlocked
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="3"/><path d="M9 10V7a3.5 3.5 0 0 1 6.4-1.9"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="3"/><path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10"/></svg>';
  return wrap;
}

function renderRooms() {
  const query = elements.roomSearch.value.trim().toLocaleLowerCase("pt-BR");
  const filteredRooms = state.rooms.filter((room) =>
    `${room.name} ${room.description}`.toLocaleLowerCase("pt-BR").includes(query),
  );

  elements.roomsList.replaceChildren();
  elements.roomCount.textContent = `${state.rooms.length} ${state.rooms.length === 1 ? "sala" : "salas"}`;

  if (!filteredRooms.length) {
    const empty = document.createElement("div");
    empty.className = "empty-list";
    empty.textContent = query
      ? "Nenhuma sala encontrada para essa busca."
      : "Ainda não há salas. Crie a primeira conversa.";
    elements.roomsList.append(empty);
    return;
  }

  for (const room of filteredRooms) {
    const button = document.createElement("button");
    button.className = `room-item${state.currentRoom?.id === room.id ? " is-active" : ""}`;
    button.type = "button";
    button.setAttribute("role", "listitem");
    button.setAttribute("aria-label", `${room.name}, ${room.unlocked ? "desbloqueada" : "bloqueada"}`);

    const avatarWrap = document.createElement("span");
    avatarWrap.className = "room-avatar-wrap";
    const avatar = document.createElement("span");
    avatar.className = "avatar";
    setAvatar(avatar, room.name);
    avatarWrap.append(avatar, createLockIcon(room.unlocked));

    const body = document.createElement("span");
    body.className = "room-item__body";
    const titleRow = document.createElement("span");
    titleRow.className = "room-item__title-row";
    const title = document.createElement("span");
    title.className = "room-item__title";
    title.textContent = room.name;
    const time = document.createElement("span");
    time.className = "room-item__time";
    time.textContent = formatListTime(room.latestMessage?.createdAt);
    titleRow.append(title, time);

    const preview = document.createElement("span");
    preview.className = "room-item__preview";
    if (!room.unlocked) {
      preview.textContent = room.description || "Toque para informar a senha";
    } else if (room.latestMessage) {
      preview.textContent = `${room.latestMessage.username}: ${room.latestMessage.text}`;
    } else {
      preview.textContent = "Nenhuma mensagem ainda";
    }
    body.append(titleRow, preview);
    button.append(avatarWrap, body);
    button.addEventListener("click", () => selectRoom(room.id));
    elements.roomsList.append(button);
  }
}

async function loadSession() {
  state.session = await api("/api/session");
  state.userId = state.session.userId;
  setProfile(state.session);
}

async function loadRooms() {
  const payload = await api("/api/rooms");
  state.rooms = payload.rooms;
  if (state.currentRoom) {
    state.currentRoom = state.rooms.find((room) => room.id === state.currentRoom.id) || null;
  }
  renderRooms();
}

async function selectRoom(roomId) {
  const room = state.rooms.find((item) => item.id === roomId);
  if (!room) return;
  if (!room.unlocked) {
    state.roomToUnlock = room;
    elements.unlockTitle.textContent = `Entrar em ${room.name}`;
    elements.unlockDescription.textContent = room.description || "Informe seu nome e a senha desta conversa.";
    elements.displayNameInput.value = state.session?.displayName || localStorage.getItem("hot_chat_display_name") || "";
    elements.roomPasswordInput.value = "";
    elements.unlockError.textContent = "";
    openModal(elements.unlockModal, elements.displayNameInput.value ? elements.roomPasswordInput : elements.displayNameInput);
    return;
  }
  await openRoom(room);
}

async function openRoom(room) {
  state.currentRoom = room;
  state.messages = [];
  state.hasMore = false;
  elements.emptyState.hidden = true;
  elements.chatView.hidden = false;
  elements.chatRoomName.textContent = room.name;
  setAvatar(elements.chatAvatar, room.name);
  elements.chatPresence.innerHTML = "<i></i> Conectando...";
  elements.typingStatus.textContent = "";
  elements.appShell.classList.add("is-chat-open");
  renderRooms();
  renderMessages();

  try {
    await loadMessages(false);
    ensureSocket();
    joinCurrentRoom();
    requestAnimationFrame(() => elements.messageInput.focus());
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      await handleRoomLocked(room.id);
    } else {
      showToast(error.message, true);
    }
  }
}

async function loadMessages(loadOlder) {
  if (!state.currentRoom || state.loadingMessages) return;
  state.loadingMessages = true;
  elements.loadMoreButton.disabled = true;
  const previousHeight = elements.messages.scrollHeight;
  const before = loadOlder && state.messages.length ? state.messages[0].id : null;

  try {
    const query = new URLSearchParams({ limit: "50" });
    if (before) query.set("before", String(before));
    const payload = await api(`/api/rooms/${encodeURIComponent(state.currentRoom.id)}/messages?${query}`);
    state.hasMore = payload.messages.length === 50;
    state.messages = loadOlder
      ? [...payload.messages, ...state.messages]
      : payload.messages;
    renderMessages();
    if (loadOlder) {
      elements.messages.scrollTop = elements.messages.scrollHeight - previousHeight;
    } else {
      elements.messages.scrollTop = elements.messages.scrollHeight;
    }
  } finally {
    state.loadingMessages = false;
    elements.loadMoreButton.disabled = false;
  }
}

function renderMessages() {
  elements.messages.replaceChildren();
  elements.loadMoreButton.hidden = !state.hasMore;
  if (state.hasMore) elements.messages.append(elements.loadMoreButton);

  if (!state.messages.length && state.currentRoom) {
    const welcome = document.createElement("div");
    welcome.className = "messages-welcome";
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    setAvatar(avatar, state.currentRoom.name);
    const title = document.createElement("strong");
    title.textContent = state.currentRoom.name;
    const description = document.createElement("p");
    description.textContent = state.currentRoom.description || "Esta conversa está pronta. Envie a primeira mensagem.";
    welcome.append(avatar, title, description);
    elements.messages.append(welcome);
    return;
  }

  let previous = null;
  let previousDay = "";
  for (const message of state.messages) {
    const day = new Date(message.created_at).toDateString();
    if (day !== previousDay) {
      const divider = document.createElement("div");
      divider.className = "day-divider";
      divider.textContent = formatDay(message.created_at);
      elements.messages.append(divider);
      previousDay = day;
    }

    const mine = message.user_id === state.userId;
    const grouped = Boolean(
      previous &&
      previous.user_id === message.user_id &&
      new Date(message.created_at).getTime() - new Date(previous.created_at).getTime() < 5 * 60 * 1000 &&
      new Date(previous.created_at).toDateString() === day,
    );
    const row = document.createElement("div");
    row.className = `message-row${mine ? " message-row--mine" : ""}${grouped ? " message-row--grouped" : ""}`;

    if (!mine) {
      const avatar = document.createElement("span");
      avatar.className = "message-avatar";
      avatar.textContent = initials(message.username);
      avatar.style.setProperty("--avatar-gradient", gradientFor(message.username));
      row.append(avatar);
    }

    const block = document.createElement("div");
    block.className = "message-block";
    if (!mine && !grouped) {
      const author = document.createElement("span");
      author.className = "message-author";
      author.textContent = message.username;
      block.append(author);
    }
    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    bubble.textContent = message.text;
    const meta = document.createElement("span");
    meta.className = "message-meta";
    meta.textContent = formatMessageTime(message.created_at);
    block.append(bubble, meta);
    row.append(block);
    elements.messages.append(row);
    previous = message;
  }
}

function ensureSocket(forceReconnect = false) {
  if (!state.session?.authenticated) return;
  if (forceReconnect && state.socket) {
    state.socket.disconnect();
    state.socket = null;
  }
  if (state.socket) return;

  const socket = window.io({ autoConnect: false, reconnection: true });
  state.socket = socket;

  socket.on("connect", () => {
    elements.connectionBanner.hidden = true;
    joinCurrentRoom();
  });
  socket.on("disconnect", (reason) => {
    if (reason !== "io client disconnect") elements.connectionBanner.hidden = false;
  });
  socket.on("connect_error", (error) => {
    elements.connectionBanner.hidden = false;
    if (error.message === "unauthorized") {
      elements.connectionBanner.textContent = "Sua sessão expirou. Desbloqueie a sala novamente.";
    }
  });
  socket.on("new_message", (message) => {
    if (message.room_id !== state.currentRoom?.id) return;
    if (state.messages.some((item) => item.id === message.id)) return;
    const shouldScroll = elements.messages.scrollHeight - elements.messages.scrollTop - elements.messages.clientHeight < 100;
    state.messages.push(message);
    renderMessages();
    if (shouldScroll || message.user_id === state.userId) {
      elements.messages.scrollTop = elements.messages.scrollHeight;
    }
  });
  socket.on("room_preview", ({ roomId, latestMessage }) => {
    const room = state.rooms.find((item) => item.id === roomId);
    if (room?.unlocked) {
      room.latestMessage = latestMessage;
      renderRooms();
    }
  });
  socket.on("room_presence", ({ roomId, count }) => {
    if (roomId === state.currentRoom?.id) setPresence(count);
  });
  socket.on("user_typing", ({ roomId, username, isTyping }) => {
    if (roomId !== state.currentRoom?.id || username === state.session?.displayName) return;
    clearTimeout(state.typingUsers.get(username));
    if (isTyping) {
      state.typingUsers.set(username, setTimeout(() => {
        state.typingUsers.delete(username);
        renderTyping();
      }, 2200));
    } else {
      state.typingUsers.delete(username);
    }
    renderTyping();
  });
  socket.on("messages_cleared", ({ roomId }) => {
    if (roomId === state.currentRoom?.id) {
      state.messages = [];
      state.hasMore = false;
      renderMessages();
      showToast("As mensagens desta sala foram removidas.");
    }
  });
  socket.on("room_locked", ({ roomId }) => handleRoomLocked(roomId));
  socket.on("rooms_changed", () => loadRooms().catch(() => {}));
  socket.connect();
}

function joinCurrentRoom() {
  if (!state.socket?.connected || !state.currentRoom) return;
  state.socket.emit("join_room", { roomId: state.currentRoom.id }, (result) => {
    if (!result?.ok) {
      handleRoomLocked(state.currentRoom?.id);
      return;
    }
    setPresence(result.online);
  });
}

function setPresence(count) {
  const label = count === 1 ? "1 pessoa online" : `${count} pessoas online`;
  elements.chatPresence.innerHTML = "<i></i> ";
  elements.chatPresence.append(document.createTextNode(label));
}

function renderTyping() {
  const names = [...state.typingUsers.keys()];
  elements.typingStatus.textContent = names.length
    ? `${names.slice(0, 2).join(" e ")} ${names.length === 1 ? "está digitando" : "estão digitando"}…`
    : "";
}

async function handleRoomLocked(roomId) {
  const room = state.rooms.find((item) => item.id === roomId);
  if (room) room.unlocked = false;
  if (state.currentRoom?.id === roomId) closeConversation();
  await loadRooms().catch(() => {});
  showToast("A senha desta sala mudou ou sua sessão expirou.", true);
}

function closeConversation() {
  if (state.socket?.connected) state.socket.emit("leave_room");
  state.currentRoom = null;
  state.messages = [];
  elements.chatView.hidden = true;
  elements.emptyState.hidden = false;
  elements.appShell.classList.remove("is-chat-open");
  renderRooms();
}

function openModal(modal, focusElement) {
  for (const item of [elements.unlockModal, elements.createRoomModal, elements.manageRoomModal]) {
    item.hidden = item !== modal;
  }
  elements.modalBackdrop.hidden = false;
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => focusElement?.focus());
}

function closeModal() {
  elements.modalBackdrop.hidden = true;
  for (const modal of [elements.unlockModal, elements.createRoomModal, elements.manageRoomModal]) {
    modal.hidden = true;
  }
  document.body.style.overflow = "";
}

function showCreateRoomModal() {
  elements.createRoomForm.reset();
  elements.createRoomError.textContent = "";
  openModal(elements.createRoomModal, elements.createRoomForm.elements.name);
}

function showManageRoomModal() {
  if (!state.currentRoom) return;
  elements.manageRoomForm.reset();
  elements.manageRoomName.value = state.currentRoom.name;
  elements.manageRoomDescription.value = state.currentRoom.description;
  elements.manageRoomError.textContent = "";
  openModal(elements.manageRoomModal, elements.manageRoomName);
}

function setFormBusy(form, busy) {
  for (const control of form.elements) control.disabled = busy;
}

function showToast(message, error = false) {
  clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle("is-error", error);
  elements.toast.hidden = false;
  state.toastTimer = setTimeout(() => {
    elements.toast.hidden = true;
  }, 3800);
}

elements.unlockForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.roomToUnlock) return;
  const displayName = elements.displayNameInput.value.trim();
  elements.unlockError.textContent = "";
  setFormBusy(elements.unlockForm, true);
  try {
    await api(`/api/rooms/${encodeURIComponent(state.roomToUnlock.id)}/unlock`, {
      method: "POST",
      body: { displayName, password: elements.roomPasswordInput.value },
    });
    localStorage.setItem("hot_chat_display_name", displayName);
    const roomId = state.roomToUnlock.id;
    elements.roomPasswordInput.value = "";
    closeModal();
    await Promise.all([loadSession(), loadRooms()]);
    ensureSocket(true);
    const room = state.rooms.find((item) => item.id === roomId);
    if (room) await openRoom(room);
  } catch (error) {
    elements.unlockError.textContent = error.message;
    elements.roomPasswordInput.select();
  } finally {
    setFormBusy(elements.unlockForm, false);
  }
});

elements.createRoomForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.createRoomError.textContent = "";
  setFormBusy(elements.createRoomForm, true);
  const data = new FormData(elements.createRoomForm);
  try {
    const payload = await api("/api/rooms", {
      method: "POST",
      body: Object.fromEntries(data),
    });
    closeModal();
    await loadRooms();
    showToast(`Sala ${payload.room.name} criada. Agora informe a senha para entrar.`);
    await selectRoom(payload.room.id);
  } catch (error) {
    elements.createRoomError.textContent = error.message;
  } finally {
    setFormBusy(elements.createRoomForm, false);
  }
});

elements.manageRoomForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.currentRoom) return;
  elements.manageRoomError.textContent = "";
  setFormBusy(elements.manageRoomForm, true);
  const data = Object.fromEntries(new FormData(elements.manageRoomForm));
  const roomId = state.currentRoom.id;
  try {
    const payload = await api(`/api/rooms/${encodeURIComponent(roomId)}`, {
      method: "PATCH",
      body: data,
    });
    closeModal();
    await loadRooms();
    if (payload.passwordChanged) {
      closeConversation();
      showToast("Senha alterada. Todos precisam entrar novamente.");
    } else {
      state.currentRoom = state.rooms.find((room) => room.id === roomId) || state.currentRoom;
      elements.chatRoomName.textContent = state.currentRoom.name;
      setAvatar(elements.chatAvatar, state.currentRoom.name);
      showToast("Sala atualizada com sucesso.");
    }
  } catch (error) {
    elements.manageRoomError.textContent = error.message;
  } finally {
    setFormBusy(elements.manageRoomForm, false);
  }
});

elements.clearMessagesButton.addEventListener("click", async () => {
  if (!state.currentRoom) return;
  const adminPassword = elements.manageAdminPassword.value;
  if (!adminPassword) {
    elements.manageRoomError.textContent = "Informe a senha administrativa para limpar.";
    elements.manageAdminPassword.focus();
    return;
  }
  if (!window.confirm("Apagar permanentemente todas as mensagens desta sala?")) return;

  elements.manageRoomError.textContent = "";
  setFormBusy(elements.manageRoomForm, true);
  try {
    await api(`/api/rooms/${encodeURIComponent(state.currentRoom.id)}/messages`, {
      method: "DELETE",
      body: { adminPassword },
    });
    closeModal();
    state.messages = [];
    state.hasMore = false;
    renderMessages();
    await loadRooms();
    showToast("Mensagens removidas com sucesso.");
  } catch (error) {
    elements.manageRoomError.textContent = error.message;
  } finally {
    setFormBusy(elements.manageRoomForm, false);
  }
});

elements.messageForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = elements.messageInput.value.trim();
  if (!text || !state.currentRoom || !state.socket?.connected) {
    if (!state.socket?.connected) showToast("Aguarde a reconexão com o servidor.", true);
    return;
  }

  elements.sendButton.disabled = true;
  state.socket.timeout(8000).emit(
    "send_message",
    { roomId: state.currentRoom.id, text },
    (timeoutError, result) => {
      elements.sendButton.disabled = false;
      if (timeoutError || !result?.ok) {
        showToast(result?.error || "A mensagem não foi enviada.", true);
        return;
      }
      elements.messageInput.value = "";
      resizeComposer();
      emitTyping(false);
      elements.messageInput.focus();
    },
  );
});

function emitTyping(isTyping) {
  if (!state.socket?.connected || !state.currentRoom) return;
  state.socket.emit("typing", { roomId: state.currentRoom.id, isTyping });
}

function resizeComposer() {
  elements.messageInput.style.height = "auto";
  elements.messageInput.style.height = `${Math.min(elements.messageInput.scrollHeight, 116)}px`;
}

elements.messageInput.addEventListener("input", () => {
  resizeComposer();
  emitTyping(true);
  clearTimeout(state.typingTimer);
  state.typingTimer = setTimeout(() => emitTyping(false), 1200);
});

elements.messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    elements.messageForm.requestSubmit();
  }
});

elements.emojiButton.addEventListener("click", () => {
  const start = elements.messageInput.selectionStart;
  const end = elements.messageInput.selectionEnd;
  const current = elements.messageInput.value;
  elements.messageInput.value = `${current.slice(0, start)}❤️${current.slice(end)}`;
  elements.messageInput.selectionStart = elements.messageInput.selectionEnd = start + 2;
  elements.messageInput.focus();
  resizeComposer();
});

elements.loadMoreButton.addEventListener("click", () => loadMessages(true).catch((error) => showToast(error.message, true)));
elements.roomSearch.addEventListener("input", renderRooms);
elements.newRoomButton.addEventListener("click", showCreateRoomModal);
elements.emptyNewRoomButton.addEventListener("click", showCreateRoomModal);
elements.manageRoomButton.addEventListener("click", showManageRoomModal);
elements.backButton.addEventListener("click", closeConversation);

elements.logoutButton.addEventListener("click", async () => {
  try {
    await api("/api/logout", { method: "POST", body: {} });
  } catch {
    // A interface deve encerrar a sessão local mesmo se a conexão oscilar.
  }
  state.socket?.disconnect();
  state.socket = null;
  closeConversation();
  await Promise.all([loadSession(), loadRooms()]);
  showToast("Sessão encerrada.");
});

elements.modalBackdrop.addEventListener("click", (event) => {
  if (event.target === elements.modalBackdrop || event.target.closest("[data-close-modal]")) {
    closeModal();
  }
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-toggle-password]");
  if (!button) return;
  const input = document.getElementById(button.dataset.togglePassword);
  if (!input) return;
  input.type = input.type === "password" ? "text" : "password";
  button.textContent = input.type === "password" ? "Ver" : "Ocultar";
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.modalBackdrop.hidden) closeModal();
});

async function bootstrap() {
  try {
    await Promise.all([loadSession(), loadRooms()]);
    ensureSocket();
  } catch (error) {
    elements.roomsList.replaceChildren();
    const message = document.createElement("div");
    message.className = "empty-list";
    message.textContent = "Não foi possível conectar ao servidor. Atualize a página em alguns instantes.";
    elements.roomsList.append(message);
    showToast(error.message, true);
  }
}

bootstrap();


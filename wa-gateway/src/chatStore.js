import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

const chatsFile = path.join(config.dataDir, 'chats.json');
const maxMessagesPerChat = 300;

async function ensureDataDir() {
  await fs.mkdir(config.dataDir, { recursive: true });
}

async function readDb() {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(chatsFile, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : { chats: {} };
  } catch {
    return { chats: {} };
  }
}

async function writeDb(db) {
  await ensureDataDir();
  await fs.writeFile(chatsFile, JSON.stringify(db, null, 2));
}

function sanitizeText(text) {
  return String(text || '').trim();
}

function normalizeMessages(messages) {
  return Array.isArray(messages) ? messages.slice(-maxMessagesPerChat) : [];
}

function ensureChat(db, jid, name = null) {
  if (!db.chats || typeof db.chats !== 'object') db.chats = {};
  if (!db.chats[jid]) {
    db.chats[jid] = {
      jid,
      name: name || null,
      unread: 0,
      last_message: '',
      last_at: null,
      messages: []
    };
  }
  if (name && !db.chats[jid].name) db.chats[jid].name = name;
  db.chats[jid].messages = normalizeMessages(db.chats[jid].messages);
  return db.chats[jid];
}

export async function upsertChat({ jid, name = null }) {
  if (!jid) return null;
  const db = await readDb();
  const chat = ensureChat(db, jid, name);
  await writeDb(db);
  return {
    jid: chat.jid,
    name: chat.name,
    unread: Number(chat.unread || 0),
    last_message: chat.last_message || '',
    last_at: chat.last_at || null
  };
}

export async function listChats() {
  const db = await readDb();
  return Object.values(db.chats || {})
    .map((chat) => ({
      jid: chat.jid,
      name: chat.name,
      unread: Number(chat.unread || 0),
      last_message: chat.last_message || '',
      last_at: chat.last_at || null
    }))
    .sort((left, right) => String(right.last_at || '').localeCompare(String(left.last_at || '')));
}

export async function getChatMessages(jid) {
  const db = await readDb();
  const chat = db.chats?.[jid];
  if (!chat) return null;
  chat.unread = 0;
  await writeDb(db);
  return {
    jid: chat.jid,
    name: chat.name,
    messages: normalizeMessages(chat.messages)
  };
}

export async function hasChat(jid) {
  const db = await readDb();
  return Boolean(db.chats?.[jid]);
}

export async function appendChatMessage({ jid, id, direction, text, at, name = null }) {
  const cleanText = sanitizeText(text);
  if (!jid || !id || !cleanText) return null;

  const db = await readDb();
  const chat = ensureChat(db, jid, name);
  const exists = chat.messages.some((message) => message.id === id);
  if (exists) return chat;

  const message = {
    id,
    direction,
    text: cleanText,
    at: at || new Date().toISOString(),
    status: direction === 'outgoing' ? 'sent' : undefined
  };

  chat.messages.push(message);
  chat.messages = normalizeMessages(chat.messages);
  chat.last_message = cleanText;
  chat.last_at = message.at;
  if (direction === 'incoming') chat.unread = Number(chat.unread || 0) + 1;

  await writeDb(db);
  return chat;
}

export async function updateMessageStatus({ jid, id, status }) {
  if (!jid || !id || !status) return null;

  const db = await readDb();
  const chat = db.chats?.[jid];
  if (!chat || !Array.isArray(chat.messages)) return null;

  const message = chat.messages.find((item) => item.id === id);
  if (!message || message.direction !== 'outgoing') return null;

  const ranks = { sent: 1, delivered: 2, read: 3 };
  const currentRank = ranks[message.status] || 0;
  const nextRank = ranks[status] || 0;
  if (nextRank < currentRank) return message;

  message.status = status;
  await writeDb(db);
  return message;
}

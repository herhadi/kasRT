import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

const chatsFile = path.join(config.dataDir, 'chats.json');
const maxMessagesPerChat = 300;
const autoMergeWindowMs = 10 * 60 * 1000;
const duplicateIncomingWindowMs = 2 * 60 * 1000;

async function ensureDataDir() {
  await fs.mkdir(config.dataDir, { recursive: true });
}

async function readDb() {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(chatsFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { chats: {}, aliases: {} };
    return {
      chats: parsed.chats && typeof parsed.chats === 'object' ? parsed.chats : {},
      aliases: parsed.aliases && typeof parsed.aliases === 'object' ? parsed.aliases : {}
    };
  } catch {
    return { chats: {}, aliases: {} };
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
  if (!db.aliases || typeof db.aliases !== 'object') db.aliases = {};
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

function resolveJid(db, jid) {
  if (!db.aliases || typeof db.aliases !== 'object') db.aliases = {};
  return db.aliases[jid] || jid;
}

function isLidJid(jid) {
  return String(jid || '').endsWith('@lid');
}

function isPhoneJid(jid) {
  return String(jid || '').endsWith('@s.whatsapp.net');
}

function phoneFromJid(jid) {
  return String(jid || '').replace('@s.whatsapp.net', '').replace('@lid', '');
}

function isBlankOrPhoneName(name, jid) {
  const cleanName = String(name || '').trim();
  if (!cleanName) return true;
  return cleanName === phoneFromJid(jid);
}

function latestOutgoingPhoneChat(db, incomingAt = new Date().toISOString()) {
  const incomingTime = new Date(incomingAt).getTime();
  const chats = Object.values(db.chats || {})
    .filter((chat) => isPhoneJid(chat.jid) && Array.isArray(chat.messages))
    .map((chat) => ({
      chat,
      latestOutgoing: [...chat.messages].reverse().find((message) => message.direction === 'outgoing')
    }))
    .filter((item) => item.latestOutgoing?.at)
    .filter((item) => {
      const outgoingTime = new Date(item.latestOutgoing.at).getTime();
      if (!Number.isFinite(incomingTime) || !Number.isFinite(outgoingTime)) return false;
      const diffMs = Math.abs(incomingTime - outgoingTime);
      return diffMs <= autoMergeWindowMs;
    })
    .sort((left, right) => String(right.latestOutgoing.at).localeCompare(String(left.latestOutgoing.at)));

  if (chats.length !== 1) return null;

  const latest = chats[0];
  if (!latest) return null;
  return latest.chat;
}

function linkAlias(db, aliasJid, targetJid, aliasName = null) {
  if (!aliasJid || !targetJid || aliasJid === targetJid) return targetJid;
  if (!db.aliases || typeof db.aliases !== 'object') db.aliases = {};
  db.aliases[aliasJid] = targetJid;

  const aliasChat = db.chats?.[aliasJid];
  const candidateName = aliasChat?.name || aliasName || null;
  const targetChat = ensureChat(db, targetJid, candidateName);
  if (candidateName && isBlankOrPhoneName(targetChat.name, targetChat.jid)) {
    targetChat.name = candidateName;
  }
  if (aliasChat && aliasChat !== targetChat) {
    if (aliasChat.name && isBlankOrPhoneName(targetChat.name, targetChat.jid)) {
      targetChat.name = aliasChat.name;
    }
    targetChat.messages = normalizeMessages([...(targetChat.messages || []), ...(aliasChat.messages || [])]).sort((left, right) =>
      String(left.at || '').localeCompare(String(right.at || ''))
    );
    targetChat.unread = Number(targetChat.unread || 0) + Number(aliasChat.unread || 0);
    const lastMessage = targetChat.messages[targetChat.messages.length - 1];
    targetChat.last_message = lastMessage?.text || targetChat.last_message || '';
    targetChat.last_at = lastMessage?.at || targetChat.last_at || null;
    delete db.chats[aliasJid];
  }
  return targetJid;
}

function latestMessage(chat) {
  return Array.isArray(chat?.messages) ? chat.messages[chat.messages.length - 1] : null;
}

function refreshChatSummary(chat) {
  const lastMessage = latestMessage(chat);
  chat.last_message = lastMessage?.text || '';
  chat.last_at = lastMessage?.at || null;
  chat.unread = Math.min(Number(chat.unread || 0), normalizeMessages(chat.messages).length);
}

function findDuplicateIncomingChat(db, jid, text, at) {
  const incomingTime = new Date(at).getTime();
  if (!Number.isFinite(incomingTime)) return null;

  const sourceIsLid = isLidJid(jid);
  const sourceIsPhone = isPhoneJid(jid);
  if (!sourceIsLid && !sourceIsPhone) return null;

  const candidates = Object.values(db.chats || {})
    .filter((chat) => chat.jid !== jid)
    .filter((chat) => (sourceIsLid ? isPhoneJid(chat.jid) : isLidJid(chat.jid)))
    .map((chat) => ({ chat, message: latestMessage(chat) }))
    .filter((item) => item.message?.direction === 'incoming')
    .filter((item) => item.message.text === text)
    .filter((item) => {
      const candidateTime = new Date(item.message.at).getTime();
      if (!Number.isFinite(candidateTime)) return false;
      return Math.abs(incomingTime - candidateTime) <= duplicateIncomingWindowMs;
    })
    .sort((left, right) => {
      const leftDiff = Math.abs(incomingTime - new Date(left.message.at).getTime());
      const rightDiff = Math.abs(incomingTime - new Date(right.message.at).getTime());
      return leftDiff - rightDiff;
    });

  if (candidates.length !== 1) return null;
  return candidates[0].chat;
}

export async function upsertChat({ jid, name = null }) {
  if (!jid) return null;
  const db = await readDb();
  const chat = ensureChat(db, resolveJid(db, jid), name);
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
  const chat = db.chats?.[resolveJid(db, jid)];
  if (!chat) return null;
  chat.unread = 0;
  await writeDb(db);
  return {
    jid: chat.jid,
    name: chat.name,
    messages: normalizeMessages(chat.messages)
  };
}

export async function deleteChat(jid) {
  if (!jid) return null;

  const db = await readDb();
  const targetJid = resolveJid(db, jid);
  const chat = db.chats?.[targetJid];
  if (!chat) return null;

  delete db.chats[targetJid];
  for (const [aliasJid, aliasTargetJid] of Object.entries(db.aliases || {})) {
    if (aliasJid === jid || aliasJid === targetJid || aliasTargetJid === targetJid) {
      delete db.aliases[aliasJid];
    }
  }

  await writeDb(db);
  return { jid: targetJid };
}

export async function deleteChatMessage({ jid, id }) {
  if (!jid || !id) return null;

  const db = await readDb();
  const chat = db.chats?.[resolveJid(db, jid)];
  if (!chat || !Array.isArray(chat.messages)) return null;

  const beforeCount = chat.messages.length;
  chat.messages = chat.messages.filter((message) => message.id !== id);
  if (chat.messages.length === beforeCount) return null;

  refreshChatSummary(chat);
  await writeDb(db);
  return { jid: chat.jid, id };
}

export async function hasChat(jid) {
  const db = await readDb();
  return Boolean(db.chats?.[resolveJid(db, jid)]);
}

export async function appendChatMessage({ jid, id, direction, text, at, name = null }) {
  const cleanText = sanitizeText(text);
  if (!jid || !id || !cleanText) return null;

  const db = await readDb();
  const messageAt = at || new Date().toISOString();
  let targetJid = resolveJid(db, jid);
  if (direction === 'incoming' && targetJid === jid && isLidJid(jid)) {
    const targetChat = latestOutgoingPhoneChat(db, messageAt);
    if (targetChat) targetJid = linkAlias(db, jid, targetChat.jid, name);
  }
  if (direction === 'incoming' && targetJid === jid) {
    const duplicateChat = findDuplicateIncomingChat(db, jid, cleanText, messageAt);
    if (duplicateChat) {
      const phoneJid = isPhoneJid(duplicateChat.jid) ? duplicateChat.jid : jid;
      const lidJid = isLidJid(duplicateChat.jid) ? duplicateChat.jid : jid;
      if (isPhoneJid(phoneJid) && isLidJid(lidJid)) {
        targetJid = linkAlias(db, lidJid, phoneJid);
      }
    }
  }

  const chat = ensureChat(db, targetJid, name);
  const exists = chat.messages.some((message) => message.id === id);
  const duplicateIncomingExists =
    direction === 'incoming' &&
    chat.messages.some((message) => {
      if (message.direction !== 'incoming' || message.text !== cleanText) return false;
      const existingTime = new Date(message.at).getTime();
      const incomingTime = new Date(messageAt).getTime();
      if (!Number.isFinite(existingTime) || !Number.isFinite(incomingTime)) return false;
      return Math.abs(existingTime - incomingTime) <= duplicateIncomingWindowMs;
    });
  if (exists || duplicateIncomingExists) {
    await writeDb(db);
    return chat;
  }

  const message = {
    id,
    direction,
    text: cleanText,
    at: messageAt,
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
  const chat = db.chats?.[resolveJid(db, jid)];
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

export async function updateMessageStatusById({ id, status }) {
  if (!id || !status) return null;

  const db = await readDb();
  for (const chat of Object.values(db.chats || {})) {
    if (!Array.isArray(chat.messages)) continue;
    const message = chat.messages.find((item) => item.id === id && item.direction === 'outgoing');
    if (!message) continue;

    const ranks = { sent: 1, delivered: 2, read: 3 };
    const currentRank = ranks[message.status] || 0;
    const nextRank = ranks[status] || 0;
    if (nextRank >= currentRank) {
      message.status = status;
      await writeDb(db);
    }
    return message;
  }

  return null;
}

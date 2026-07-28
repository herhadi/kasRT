import fs from 'node:fs/promises';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState
} from 'baileys';
import { wrapSocket } from 'baileys-antiban';
import pino from 'pino';
import QRCode from 'qrcode';
import { config } from './config.js';
import { appendChatMessage, hasChat, updateMessageStatus, updateMessageStatusById, upsertChat } from './chatStore.js';
import { assertCanSend, recordSend } from './store.js';

let socket = null;
let rawSocket = null;
let connecting = false;
let latestQr = null;
let latestQrDataUrl = null;
let connectionState = 'idle';
let linkedNumber = null;
let lastDisconnectReason = null;
let lastConnectedAt = null;
let lastIncomingEventAt = null;
let lastStoredMessageAt = null;
let lastInboxIgnoredReason = null;
let lastReceiptEventAt = null;
let lastReceiptStatus = null;
let lastReceiptMessageId = null;

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) throw new Error('Nomor tujuan wajib diisi.');
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  return digits;
}

function jidFromPhone(phone) {
  return `${normalizePhone(phone)}@s.whatsapp.net`;
}

function isPrivateChat(jid) {
  const value = String(jid || '');
  return value.endsWith('@s.whatsapp.net') || value.endsWith('@lid');
}

function parseLinkedNumber(userId) {
  const raw = String(userId || '');
  return raw.split(':')[0] || null;
}

function toIsoTime(timestamp) {
  const raw = Number(timestamp || 0);
  if (!raw) return new Date().toISOString();
  return new Date(raw * 1000).toISOString();
}

function extractText(message) {
  let content = message?.message || {};
  content = content.ephemeralMessage?.message || content.viewOnceMessage?.message || content;
  return (
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    content.documentMessage?.caption ||
    content.buttonsResponseMessage?.selectedDisplayText ||
    content.listResponseMessage?.title ||
    content.templateButtonReplyMessage?.selectedDisplayText ||
    ''
  );
}

function shouldReconnect(update) {
  const statusCode = update?.lastDisconnect?.error?.output?.statusCode;
  return statusCode !== DisconnectReason.loggedOut;
}

function mapMessageStatus(status) {
  const raw = typeof status === 'number' ? status : Number(status);
  if (raw >= 4) return 'read';
  if (raw >= 3) return 'delivered';
  if (raw >= 1) return 'sent';
  return null;
}

function receiptStatusFromItem(item) {
  if (item?.receipt?.readTimestamp || item?.readTimestamp || item?.update?.readTimestamp) return 'read';
  if (item?.receipt?.receiptTimestamp || item?.receiptTimestamp || item?.update?.receiptTimestamp) return 'delivered';
  return mapMessageStatus(item?.update?.status ?? item?.status ?? item?.receipt?.status);
}

function receiptMessageId(item) {
  return (
    item?.key?.id ||
    item?.messageId ||
    item?.id ||
    item?.receipt?.messageId ||
    item?.receipt?.id ||
    item?.update?.id ||
    null
  );
}

async function clearAuthDir() {
  await fs.mkdir(config.authDir, { recursive: true });
  const entries = await fs.readdir(config.authDir, { withFileTypes: true });
  await Promise.all(
    entries.map((entry) => {
      const targetPath = `${config.authDir}/${entry.name}`;
      return fs.rm(targetPath, { recursive: true, force: true });
    })
  );
}

async function recordIncomingMessages(messages = []) {
  lastIncomingEventAt = new Date().toISOString();

  for (const message of messages) {
    const jid = message?.key?.remoteJid;
    if (!jid) {
      lastInboxIgnoredReason = 'remoteJid kosong';
      continue;
    }
    if (!isPrivateChat(jid)) {
      lastInboxIgnoredReason = `bukan chat 1:1: ${jid}`;
      continue;
    }
    if (message?.key?.fromMe) {
      lastInboxIgnoredReason = `pesan dari akun sendiri: ${jid}`;
      continue;
    }

    const text = extractText(message);
    if (!String(text || '').trim()) {
      lastInboxIgnoredReason = `pesan tanpa teks/caption: ${jid}`;
      continue;
    }

    await appendChatMessage({
      jid,
      id: message.key.id,
      direction: 'incoming',
      text,
      at: toIsoTime(message.messageTimestamp),
      name: message.pushName || null
    });
    lastStoredMessageAt = new Date().toISOString();
    lastInboxIgnoredReason = null;
  }
}

async function recordMessageUpdates(updates = []) {
  for (const item of updates) {
    const jid = item?.key?.remoteJid;
    const id = item?.key?.id;
    const status = mapMessageStatus(item?.update?.status ?? item?.status);
    if (!jid || !id || !status) continue;
    const updated = await updateMessageStatus({ jid, id, status });
    if (!updated) await updateMessageStatusById({ id, status });
    lastReceiptEventAt = new Date().toISOString();
    lastReceiptStatus = status;
    lastReceiptMessageId = id;
  }
}

async function recordReceiptUpdates(updates = []) {
  for (const item of updates) {
    const jid = item?.key?.remoteJid || item?.remoteJid || item?.jid || item?.receipt?.remoteJid || null;
    const id = receiptMessageId(item);
    const status = receiptStatusFromItem(item);
    if (!id || !status) continue;
    const updated = jid ? await updateMessageStatus({ jid, id, status }) : null;
    if (!updated) await updateMessageStatusById({ id, status });
    lastReceiptEventAt = new Date().toISOString();
    lastReceiptStatus = status;
    lastReceiptMessageId = id;
  }
}

export async function startWhatsApp() {
  if (connecting || socket) return;
  connecting = true;
  connectionState = 'connecting';

  await fs.mkdir(config.authDir, { recursive: true });
  const logger = pino({ level: config.logLevel });
  const { state, saveCreds } = await useMultiFileAuthState(config.authDir);
  const { version } = await fetchLatestBaileysVersion();

  rawSocket = makeWASocket({
    auth: state,
    version,
    logger,
    browser: ['KasRT WA Lab', 'Chrome', '1.0'],
    markOnlineOnConnect: false,
    syncFullHistory: false,
    printQRInTerminal: false
  });

  socket = wrapSocket(rawSocket, config.antiban, undefined, {
    groupOpGuard: false,
    legitimacySignals: false
  });
  rawSocket.ev.on('creds.update', saveCreds);
  rawSocket.ev.on('messages.upsert', async ({ messages }) => {
    await recordIncomingMessages(messages).catch((error) => {
      lastDisconnectReason = `message store failed: ${error.message}`;
    });
  });
  rawSocket.ev.on('messages.update', async (updates) => {
    await recordMessageUpdates(updates).catch((error) => {
      lastDisconnectReason = `message status failed: ${error.message}`;
    });
  });
  rawSocket.ev.on('message-receipt.update', async (updates) => {
    await recordReceiptUpdates(updates).catch((error) => {
      lastDisconnectReason = `receipt status failed: ${error.message}`;
    });
  });
  rawSocket.ev.on('connection.update', async (update) => {
    if (update.qr) {
      latestQr = update.qr;
      latestQrDataUrl = await QRCode.toDataURL(update.qr);
      connectionState = 'qr';
    }

    if (update.connection === 'open') {
      latestQr = null;
      latestQrDataUrl = null;
      lastDisconnectReason = null;
      connectionState = 'connected';
      linkedNumber = parseLinkedNumber(socket?.user?.id || rawSocket?.user?.id);
      lastConnectedAt = new Date().toISOString();
    }

    if (update.connection === 'close') {
      lastDisconnectReason = update.lastDisconnect?.error?.message || 'connection closed';
      connectionState = 'closed';
      socket = null;
      rawSocket = null;
      connecting = false;
      if (shouldReconnect(update)) {
        setTimeout(() => {
          startWhatsApp().catch((error) => {
            lastDisconnectReason = error.message;
          });
        }, 5000);
      }
    }
  });

  connecting = false;
}

export function getStatus() {
  return {
    state: connectionState,
    connected: connectionState === 'connected',
    has_qr: Boolean(latestQr),
    linked_number: linkedNumber,
    last_connected_at: lastConnectedAt,
    last_disconnect_reason: lastDisconnectReason,
    antiban: {
      preset: config.antiban.preset,
      max_per_minute: config.antiban.maxPerMinute,
      max_per_hour: config.antiban.maxPerHour,
      max_per_day: config.antiban.maxPerDay,
      min_delay_ms: config.antiban.minDelayMs,
      max_delay_ms: config.antiban.maxDelayMs
    },
    stats: socket?.antiban?.getStats?.() || null,
    inbox: {
      last_incoming_event_at: lastIncomingEventAt,
      last_stored_message_at: lastStoredMessageAt,
      last_ignored_reason: lastInboxIgnoredReason,
      last_receipt_event_at: lastReceiptEventAt,
      last_receipt_status: lastReceiptStatus,
      last_receipt_message_id: lastReceiptMessageId
    }
  };
}

export function getQr() {
  return {
    has_qr: Boolean(latestQr),
    qr: latestQr,
    qr_data_url: latestQrDataUrl
  };
}

export async function sendTestMessage({ phone, text }) {
  if (!socket || connectionState !== 'connected') {
    throw new Error('WhatsApp belum connected. Scan QR dulu.');
  }

  const normalizedPhone = normalizePhone(phone);
  const messageText = String(text || '').trim();
  if (messageText.length < config.minTextLength) {
    throw new Error(`Teks minimal ${config.minTextLength} karakter.`);
  }

  await assertCanSend(normalizedPhone);
  const jid = jidFromPhone(normalizedPhone);
  const result = await socket.sendMessage(jid, { text: messageText }, {});
  const usage = await recordSend(normalizedPhone);

  return {
    jid,
    message_id: result?.key?.id || null,
    usage: {
      date: usage.date,
      unique_recipients: usage.uniqueRecipients.length,
      daily_unique_limit: config.dailyUniqueLimit
    }
  };
}

export async function sendChatReply({ jid, text }) {
  if (!socket || connectionState !== 'connected') {
    throw new Error('WhatsApp belum connected. Scan QR dulu.');
  }
  if (!isPrivateChat(jid)) {
    throw new Error('Reply hanya mendukung chat 1:1.');
  }
  if (!(await hasChat(jid))) {
    throw new Error('Chat belum dikenal. Tunggu pesan masuk dulu sebelum membalas.');
  }

  const messageText = String(text || '').trim();
  if (messageText.length < config.minTextLength) {
    throw new Error(`Teks minimal ${config.minTextLength} karakter.`);
  }

  const result = await socket.sendMessage(jid, { text: messageText }, {});
  await appendChatMessage({
    jid,
    id: result?.key?.id || `out-${Date.now()}`,
    direction: 'outgoing',
    text: messageText,
    at: new Date().toISOString()
  });

  return {
    jid,
    message_id: result?.key?.id || null
  };
}

export async function startChatMessage({ phone, name, text }) {
  if (!socket || connectionState !== 'connected') {
    throw new Error('WhatsApp belum connected. Scan QR dulu.');
  }

  const normalizedPhone = normalizePhone(phone);
  const jid = jidFromPhone(normalizedPhone);
  const messageText = String(text || '').trim();
  if (messageText.length < config.minTextLength) {
    throw new Error(`Teks minimal ${config.minTextLength} karakter.`);
  }

  await assertCanSend(normalizedPhone);
  await upsertChat({ jid, name: name || normalizedPhone });
  const result = await socket.sendMessage(jid, { text: messageText }, {});
  await recordSend(normalizedPhone);
  await appendChatMessage({
    jid,
    id: result?.key?.id || `out-${Date.now()}`,
    direction: 'outgoing',
    text: messageText,
    at: new Date().toISOString(),
    name: name || normalizedPhone
  });

  return {
    jid,
    message_id: result?.key?.id || null
  };
}

export async function resetSession() {
  const previousRawSocket = rawSocket;

  socket = null;
  rawSocket = null;
  connecting = false;
  latestQr = null;
  latestQrDataUrl = null;
  linkedNumber = null;
  lastDisconnectReason = null;
  connectionState = 'resetting';

  if (previousRawSocket?.logout) {
    await previousRawSocket.logout().catch(() => {});
  }

  await clearAuthDir();
  try {
    await startWhatsApp();
  } catch (error) {
    lastDisconnectReason = `reset restart failed: ${error.message}`;
    connectionState = 'reset_failed';
    throw error;
  }
}

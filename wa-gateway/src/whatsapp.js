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

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) throw new Error('Nomor tujuan wajib diisi.');
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  return digits;
}

function jidFromPhone(phone) {
  return `${normalizePhone(phone)}@s.whatsapp.net`;
}

function parseLinkedNumber(userId) {
  const raw = String(userId || '');
  return raw.split(':')[0] || null;
}

function shouldReconnect(update) {
  const statusCode = update?.lastDisconnect?.error?.output?.statusCode;
  return statusCode !== DisconnectReason.loggedOut;
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

  socket = wrapSocket(rawSocket, config.antiban);
  socket.ev.on('creds.update', saveCreds);
  socket.ev.on('connection.update', async (update) => {
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
    stats: socket?.antiban?.getStats?.() || null
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
  const result = await socket.sendMessage(jid, { text: messageText });
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

export async function resetSession() {
  if (rawSocket?.logout) {
    await rawSocket.logout().catch(() => {});
  }
  socket = null;
  rawSocket = null;
  latestQr = null;
  latestQrDataUrl = null;
  linkedNumber = null;
  connectionState = 'resetting';
  await fs.rm(config.authDir, { recursive: true, force: true });
  await startWhatsApp();
}

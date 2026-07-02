import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import { rm } from 'fs/promises';

const AUTH_DIR = process.env.WA_AUTH_DIR || './auth';
const logger = pino({ level: process.env.WA_LOG_LEVEL || 'silent' });

let socket = null;
let connecting = false;
let latestQr = null;
let latestQrDataUrl = null;
let connectionState = 'starting';
let connectedNumber = null;
let lastDisconnectReason = null;
let lastConnectedAt = null;
let lastQrAt = null;

function normalizeConnectedNumber(value) {
  const raw = String(value || '').split(':')[0].split('@')[0].replace(/[^\d]/g, '');
  return raw || null;
}

export async function startWhatsApp() {
  if (socket || connecting) return;
  connecting = true;
  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    socket = makeWASocket({
      auth: state,
      version,
      printQRInTerminal: true,
      logger,
      browser: ['KasRT WA Gateway', 'Chrome', '1.0.0']
    });

    socket.ev.on('creds.update', saveCreds);
    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        latestQr = qr;
        latestQrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
        lastQrAt = new Date().toISOString();
        connectionState = 'qr';
      }

      if (connection === 'open') {
        connectionState = 'connected';
        latestQr = null;
        latestQrDataUrl = null;
        connectedNumber = normalizeConnectedNumber(socket?.user?.id);
        lastConnectedAt = new Date().toISOString();
        lastDisconnectReason = null;
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        lastDisconnectReason = statusCode || lastDisconnect?.error?.message || 'closed';
        socket = null;
        connectionState = statusCode === DisconnectReason.loggedOut ? 'logged_out' : 'disconnected';
        if (statusCode !== DisconnectReason.loggedOut) {
          setTimeout(() => {
            void startWhatsApp();
          }, 5000);
        }
      }
    });
  } finally {
    connecting = false;
  }
}

export function getWhatsAppStatus() {
  return {
    connected: connectionState === 'connected',
    state: connectionState,
    number: connectedNumber,
    has_qr: Boolean(latestQrDataUrl),
    last_qr_at: lastQrAt,
    last_connected_at: lastConnectedAt,
    last_disconnect_reason: lastDisconnectReason
  };
}

export function getWhatsAppQr() {
  return {
    qr: latestQr,
    qr_data_url: latestQrDataUrl,
    last_qr_at: lastQrAt
  };
}

export async function resetWhatsAppSession() {
  const currentSocket = socket;
  socket = null;
  connecting = false;
  latestQr = null;
  latestQrDataUrl = null;
  connectedNumber = null;
  lastConnectedAt = null;
  lastDisconnectReason = 'session_reset';
  connectionState = 'resetting';

  try {
    if (currentSocket?.logout) {
      await currentSocket.logout();
    }
  } catch {
    // Session files are removed below; logout can fail when socket is already stale.
  }

  try {
    currentSocket?.end?.();
  } catch {
    // Ignore stale socket cleanup errors.
  }

  await rm(AUTH_DIR, { recursive: true, force: true });
  connectionState = 'starting';
  await startWhatsApp();
  return getWhatsAppStatus();
}

export async function sendWhatsAppMessage(target, message) {
  if (!socket || connectionState !== 'connected') {
    throw new Error(`WhatsApp belum connected. State: ${connectionState}`);
  }

  const jid = `${target}@s.whatsapp.net`;
  const result = await socket.sendMessage(jid, { text: String(message || '') });
  return {
    sent: true,
    target,
    message_id: result?.key?.id || null
  };
}

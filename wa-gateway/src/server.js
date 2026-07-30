import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertConfig, config } from './config.js';
import { fullResetSession, getQr, getStatus, resetSession, sendChatReply, sendTestMessage, startChatMessage, startWhatsApp } from './whatsapp.js';
import { deleteChat, deleteChatMessage, getChatMessages, listChats } from './chatStore.js';
import { getUsage } from './store.js';

assertConfig();

const app = express();
const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const diagnostics = {
  last_request_at: null,
  last_request_method: null,
  last_request_path: null,
  last_response_status: null,
  last_send_request_at: null,
  last_send_route: null,
  last_send_target: null,
  last_send_text_length: null,
  last_send_success_at: null,
  last_send_error_at: null,
  last_send_error: null
};

app.use(express.json({ limit: '128kb' }));
app.use(express.static(publicDir));

app.use((req, res, next) => {
  diagnostics.last_request_at = new Date().toISOString();
  diagnostics.last_request_method = req.method;
  diagnostics.last_request_path = req.path;
  res.on('finish', () => {
    diagnostics.last_response_status = res.statusCode;
  });
  next();
});

function markSendRequest({ route, target, text }) {
  diagnostics.last_send_request_at = new Date().toISOString();
  diagnostics.last_send_route = route;
  diagnostics.last_send_target = target || null;
  diagnostics.last_send_text_length = String(text || '').length;
  diagnostics.last_send_success_at = null;
  diagnostics.last_send_error_at = null;
  diagnostics.last_send_error = null;
}

function markSendSuccess() {
  diagnostics.last_send_success_at = new Date().toISOString();
}

function markSendError(error) {
  diagnostics.last_send_error_at = new Date().toISOString();
  diagnostics.last_send_error = error instanceof Error ? error.message : String(error);
}

function requireSecret(req, res, next) {
  const headerSecret = String(req.headers['x-wa-lab-secret'] || req.headers['x-wa-gateway-secret'] || '').trim();
  const bearerSecret = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (headerSecret === config.secret || bearerSecret === config.secret) return next();
  return res.status(403).json({ success: false, message: 'Forbidden' });
}

app.get('/health', (_req, res) => {
  res.json({ success: true, service: 'kasrt-wa-gateway-lab' });
});

app.get('/', (_req, res) => {
  res.json({
    success: true,
    service: 'kasrt-wa-gateway-lab',
    message: 'KasRT WA Gateway Lab aktif. Buka root untuk mini inbox, atau gunakan endpoint API.',
    endpoints: {
      health: 'GET /health',
      status: 'GET /status',
      qr: 'GET /qr',
      send_test: 'POST /send-test',
      chats: 'GET /chats',
      start_chat: 'POST /chats/start',
      messages: 'GET /chats/:jid/messages',
      delete_chat: 'DELETE /chats/:jid',
      delete_message: 'DELETE /chats/:jid/messages/:messageId',
      reply: 'POST /chats/:jid/reply',
      reset_session: 'POST /session/reset',
      full_reset_session: 'POST /session/full-reset'
    }
  });
});

app.get('/status', requireSecret, async (_req, res) => {
  const usage = await getUsage();
  res.json({
    success: true,
    data: {
      ...getStatus(),
      usage: {
        date: usage.date,
        unique_recipients: usage.uniqueRecipients.length,
        daily_unique_limit: config.dailyUniqueLimit
      },
      diagnostics
    }
  });
});

app.get('/qr', requireSecret, async (_req, res) => {
  const status = getStatus();
  if (!status.connected && !status.has_qr) {
    await startWhatsApp().catch(() => {});
  }
  res.json({ success: true, data: getQr() });
});

app.post('/send-test', requireSecret, async (req, res) => {
  markSendRequest({ route: '/send-test', target: req.body?.phone, text: req.body?.text });
  try {
    const data = await sendTestMessage({
      phone: req.body?.phone,
      text: req.body?.text
    });
    markSendSuccess();
    res.json({ success: true, data });
  } catch (error) {
    markSendError(error);
    res.status(400).json({ success: false, message: error.message });
  }
});

app.get('/chats', requireSecret, async (_req, res) => {
  const chats = await listChats();
  res.json({ success: true, data: chats });
});

app.post('/chats/start', requireSecret, async (req, res) => {
  markSendRequest({ route: '/chats/start', target: req.body?.phone, text: req.body?.text });
  try {
    const data = await startChatMessage({
      phone: req.body?.phone,
      name: req.body?.name,
      text: req.body?.text
    });
    markSendSuccess();
    res.json({ success: true, data });
  } catch (error) {
    markSendError(error);
    res.status(400).json({ success: false, message: error.message });
  }
});

app.get('/chats/:jid/messages', requireSecret, async (req, res) => {
  const jid = decodeURIComponent(req.params.jid || '');
  const chat = await getChatMessages(jid);
  if (!chat) return res.status(404).json({ success: false, message: 'Chat tidak ditemukan.' });
  return res.json({ success: true, data: chat });
});

app.delete('/chats/:jid', requireSecret, async (req, res) => {
  const jid = decodeURIComponent(req.params.jid || '');
  const deleted = await deleteChat(jid);
  if (!deleted) return res.status(404).json({ success: false, message: 'Chat tidak ditemukan.' });
  return res.json({ success: true, data: deleted });
});

app.delete('/chats/:jid/messages/:messageId', requireSecret, async (req, res) => {
  const deleted = await deleteChatMessage({
    jid: decodeURIComponent(req.params.jid || ''),
    id: decodeURIComponent(req.params.messageId || '')
  });
  if (!deleted) return res.status(404).json({ success: false, message: 'Pesan tidak ditemukan.' });
  return res.json({ success: true, data: deleted });
});

app.post('/chats/:jid/reply', requireSecret, async (req, res) => {
  markSendRequest({ route: '/chats/:jid/reply', target: decodeURIComponent(req.params.jid || ''), text: req.body?.text });
  try {
    const data = await sendChatReply({
      jid: decodeURIComponent(req.params.jid || ''),
      text: req.body?.text
    });
    markSendSuccess();
    res.json({ success: true, data });
  } catch (error) {
    markSendError(error);
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/session/reset', requireSecret, async (req, res) => {
  if (String(req.body?.confirm || '') !== 'RESET') {
    return res.status(400).json({ success: false, message: 'Kirim body confirm=RESET untuk reset session.' });
  }
  try {
    await resetSession();
    return res.json({ success: true, message: 'Session direset. Ambil QR baru dari /qr.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: `Reset session gagal: ${error.message}` });
  }
});

app.post('/session/full-reset', requireSecret, async (req, res) => {
  if (String(req.body?.confirm || '') !== 'FULL_RESET') {
    return res.status(400).json({ success: false, message: 'Kirim body confirm=FULL_RESET untuk full reset.' });
  }
  try {
    await fullResetSession();
    return res.json({ success: true, message: 'Full reset selesai. Ambil QR baru dari /qr.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: `Full reset gagal: ${error.message}` });
  }
});

app.listen(config.port, '0.0.0.0', async () => {
  console.log(`KasRT WA Gateway Lab running on :${config.port}`);
  startWhatsApp().catch((error) => {
    console.error('WA startup failed:', error.message);
  });
});

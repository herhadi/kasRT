import crypto from 'crypto';
import { pool } from '../db.js';
import { sendTelegramMessage } from '../services/telegramService.js';

function normalizeBotUsername(username) {
  if (!username) return '';
  return String(username).trim().replace(/^@+/, '');
}

let cachedBotUsername = null;

async function resolveBotUsername() {
  const fromEnv = normalizeBotUsername(process.env.TELEGRAM_BOT_USERNAME);
  if (fromEnv) return fromEnv;

  if (cachedBotUsername) return cachedBotUsername;

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return '';

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    if (!response.ok) return '';

    const payload = await response.json();
    const username = normalizeBotUsername(payload?.result?.username);
    if (!username) return '';

    cachedBotUsername = username;
    return username;
  } catch {
    return '';
  }
}

export async function telegramWebhook(req, res) {
  const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const incomingSecret = req.headers['x-telegram-bot-api-secret-token'];

  if (configuredSecret && incomingSecret !== configuredSecret) {
    return res.status(403).json({ ok: false, error: 'Webhook secret invalid' });
  }

  const message = req.body?.message;
  if (!message?.text || !message?.chat?.id) {
    return res.json({ ok: true, ignored: true });
  }

  const text = message.text.trim();
  const chatId = String(message.chat.id);
  const startMatch = text.match(/^\/start(?:@\w+)?(?:\s+(.+))?$/i);

  if (!startMatch) {
    return res.json({ ok: true, ignored: true });
  }

  const payload = (startMatch[1] || '').trim();

  if (!payload) {
    await sendTelegramMessage(
      chatId,
      'Halo! Selamat datang di Bot KasRT.\n\nSilakan aktivasi dari dashboard KasRT agar akun Telegram Anda terhubung dan bisa menerima notifikasi approval.'
    );
    return res.json({ ok: true, status: 'greeted' });
  }

  const activationMatch = payload.match(/^kasrt_([a-f0-9]{16})$/i);
  if (!activationMatch) {
    await sendTelegramMessage(
      chatId,
      'Kode aktivasi tidak dikenali. Silakan klik ulang tombol Aktivasi Telegram dari dashboard KasRT.'
    );
    return res.json({ ok: true, status: 'invalid_start_payload' });
  }

  const code = activationMatch[1].toLowerCase();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tokenResult = await client.query(
      `SELECT id, user_id
       FROM telegram_link_tokens
       WHERE code = $1
         AND used_at IS NULL
         AND expires_at > NOW()
       FOR UPDATE`,
      [code]
    );

    if (tokenResult.rowCount === 0) {
      await client.query('COMMIT');
      await sendTelegramMessage(
        chatId,
        'Kode aktivasi tidak valid atau sudah kedaluwarsa. Silakan generate ulang dari dashboard KasRT.'
      );
      return res.json({ ok: true, status: 'invalid_or_expired_code' });
    }

    const token = tokenResult.rows[0];

    await client.query(
      `UPDATE users
       SET telegram_chat_id = $1
       WHERE id = $2`,
      [chatId, token.user_id]
    );

    await client.query(
      `UPDATE telegram_link_tokens
       SET used_at = NOW()
       WHERE id = $1`,
      [token.id]
    );

    await client.query('COMMIT');
    await sendTelegramMessage(
      chatId,
      'Aktivasi berhasil. Akun Telegram Anda sekarang terhubung dengan KasRT.'
    );
    return res.json({ ok: true });
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(500).json({ ok: false, error: error.message });
  } finally {
    client.release();
  }
}

export async function generateTelegramActivationLink(req, res) {
  const userId = req.user.user_id;
  const botUsername = await resolveBotUsername();

  if (!botUsername) {
    return res.status(400).json({
      success: false,
      message: 'TELEGRAM_BOT_USERNAME belum diset dan username bot tidak bisa diambil otomatis'
    });
  }

  const code = crypto.randomBytes(8).toString('hex');

  await pool.query(
    `INSERT INTO telegram_link_tokens (user_id, code, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '15 minutes')`,
    [userId, code]
  );

  const activationLink = `https://t.me/${botUsername}?start=kasrt_${code}`;

  return res.json({
    success: true,
    activation_link: activationLink,
    expires_in_minutes: 15
  });
}

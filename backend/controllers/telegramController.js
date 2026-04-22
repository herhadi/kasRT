import crypto from 'crypto';
import { pool } from '../db.js';

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
  const match = text.match(/^\/start\s+kasrt_([a-f0-9]{16})$/i);

  if (!match) {
    return res.json({ ok: true, ignored: true });
  }

  const code = match[1].toLowerCase();
  const chatId = String(message.chat.id);

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

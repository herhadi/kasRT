import crypto from 'crypto';
import { pool } from '../db.js';

function parseStartCode(text) {
  if (!text || typeof text !== 'string') return null;
  const match = text.trim().match(/^\/start\s+kasrt_(\w{6,32})$/i);
  return match ? match[1] : null;
}

export async function telegramWebhook(req, res) {
  const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const incomingSecret = req.headers['x-telegram-bot-api-secret-token'];

  if (configuredSecret && incomingSecret !== configuredSecret) {
    return res.status(401).json({ ok: false });
  }

  const message = req.body?.message;
  const chatId = message?.chat?.id;
  const text = message?.text;

  const code = parseStartCode(text);
  if (!code || !chatId) {
    return res.json({ ok: true });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tokenRes = await client.query(
      `SELECT id, user_id
       FROM telegram_link_tokens
       WHERE code = $1
         AND used_at IS NULL
         AND expires_at > NOW()
       FOR UPDATE`,
      [code]
    );

    if (tokenRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.json({ ok: true });
    }

    const tokenRow = tokenRes.rows[0];

    await client.query(
      `UPDATE users
       SET telegram_chat_id = $1
       WHERE id = $2`,
      [String(chatId), tokenRow.user_id]
    );

    await client.query(
      `UPDATE telegram_link_tokens
       SET used_at = NOW()
       WHERE id = $1`,
      [tokenRow.id]
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
  const botUsername = process.env.TELEGRAM_BOT_USERNAME;

  if (!botUsername) {
    return res.status(400).json({
      success: false,
      message: 'TELEGRAM_BOT_USERNAME belum diset'
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

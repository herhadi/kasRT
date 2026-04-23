import crypto from 'crypto';
import { sendTelegramMessage } from '../services/telegramService.js';
import {
  createTelegramActivationToken,
  findUserByTelegramChatId,
  linkTelegramChatWithCode
} from '../models/telegramModel.js';

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
    const userByChatId = await findUserByTelegramChatId(chatId);
    if (userByChatId) {
      await sendTelegramMessage(
        chatId,
        `Selamat datang <b>${userByChatId.nama}</b>.\n\nAkun Telegram Anda sudah terhubung dengan KasRT.`
      );
    } else {
      await sendTelegramMessage(
        chatId,
        'Halo! Selamat datang di Bot KasRT.\n\nSilakan aktivasi dari dashboard KasRT agar akun Telegram Anda terhubung dan bisa menerima notifikasi approval.'
      );
    }
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

  try {
    const token = await linkTelegramChatWithCode({ code, chatId });
    if (!token) {
      await sendTelegramMessage(
        chatId,
        'Kode aktivasi tidak valid atau sudah kedaluwarsa. Silakan generate ulang dari dashboard KasRT.'
      );
      return res.json({ ok: true, status: 'invalid_or_expired_code' });
    }
    await sendTelegramMessage(
      chatId,
      `Selamat datang <b>${token.nama}</b>.\n\nAktivasi berhasil. Akun Telegram Anda sekarang terhubung dengan KasRT.`
    );
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
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

  await createTelegramActivationToken({ userId, code });

  const activationLink = `https://t.me/${botUsername}?start=kasrt_${code}`;

  return res.json({
    success: true,
    activation_link: activationLink,
    expires_in_minutes: 15
  });
}

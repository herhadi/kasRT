import crypto from 'crypto';
import { sendTelegramMessage, formatRupiah } from '../services/telegramService.js';
import {
  clearTelegramChatByUserId,
  createTelegramActivationToken,
  findUserByTelegramChatId,
  linkTelegramChatWithCode
} from '../models/telegramModel.js';
import { getTabunganBalanceByWarga } from '../models/tabunganModel.js';

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

  // Be tolerant when secret header is missing/mismatched to avoid dropped updates.
  // We still log mismatch for investigation.
  if (configuredSecret && incomingSecret !== configuredSecret) {
    console.warn('[TELEGRAM][WEBHOOK] secret mismatch', {
      hasIncomingSecret: Boolean(incomingSecret)
    });
  }

  const update =
    req.body?.message ||
    req.body?.edited_message ||
    req.body?.channel_post ||
    req.body?.edited_channel_post ||
    req.body?.callback_query?.message ||
    null;

  if (!update?.text || !update?.chat?.id) {
    return res.json({ ok: true, ignored: true });
  }

  const text = String(update.text || '').trim();
  const chatId = String(update.chat.id);
  const startMatch = text.match(/^\/start(?:@\w+)?(?:\s+(.+))?$/i);
  const command = text.split(/\s+/)[0]?.replace(/@\w+$/i, '').toLowerCase();

  if (['/cek_tabungan', '/cek_tab', '/tabungan'].includes(command)) {
    const userByChatId = await findUserByTelegramChatId(chatId);
    if (!userByChatId) {
      await sendTelegramMessage(
        chatId,
        'Akun Telegram ini belum terhubung dengan KasRT.\n\nSilakan aktivasi dari menu Profil/Akun di aplikasi KasRT terlebih dahulu.'
      );
      return res.json({ ok: true, status: 'tabungan_unlinked' });
    }

    const balance = await getTabunganBalanceByWarga({ wargaId: userByChatId.id });
    await sendTelegramMessage(
      chatId,
      `📘 <b>Saldo Tabungan Pembangunan</b>\n` +
        `Nama: <b>${userByChatId.nama}</b>\n` +
        `Status anggota: <b>${balance.is_active ? 'Aktif' : 'Nonaktif'}</b>\n` +
        `Saldo saat ini: <b>${formatRupiah(balance.total_balance)}</b>\n\n` +
        `Saldo ini sudah termasuk saldo awal migrasi jika ada.`
    );
    return res.json({ ok: true, status: 'tabungan_balance_sent' });
  }

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

export async function disconnectMyTelegram(req, res) {
  const userId = String(req.user?.user_id || '').trim();
  if (!userId) {
    return res.status(401).json({ success: false, message: 'User tidak valid' });
  }

  const updated = await clearTelegramChatByUserId(userId);
  if (!updated) {
    return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
  }

  return res.json({
    success: true,
    message: 'Akun Telegram berhasil dilepas. Silakan aktivasi ulang untuk mengganti akun Telegram.'
  });
}

export async function getTelegramWebhookInfo(_req, res) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return res.status(400).json({ success: false, message: 'TELEGRAM_BOT_TOKEN belum diset' });
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    return res.status(400).json({ success: false, message: payload?.description || 'Gagal mengambil webhook info' });
  }

  const backendUrl = String(process.env.BACKEND_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  return res.json({
    success: true,
    data: payload?.result || {},
    config: {
      required_env: ['TELEGRAM_BOT_TOKEN', 'BACKEND_PUBLIC_URL'],
      optional_env: ['TELEGRAM_WEBHOOK_SECRET', 'TELEGRAM_BOT_USERNAME'],
      backend_public_url: backendUrl,
      webhook_url_from_env: backendUrl ? `${backendUrl}/telegram/webhook` : '',
      has_webhook_secret: Boolean(String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim()),
      has_bot_username: Boolean(normalizeBotUsername(process.env.TELEGRAM_BOT_USERNAME))
    }
  });
}

export async function setTelegramWebhook(req, res) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const backendUrl = String(process.env.BACKEND_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  const manualWebhookUrl = String(req.body?.webhook_url || '').trim().replace(/\/+$/, '');
  const webhookSecret = String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();

  if (!token) {
    return res.status(400).json({ success: false, message: 'TELEGRAM_BOT_TOKEN belum diset' });
  }
  if (!backendUrl && !manualWebhookUrl) {
    return res.status(400).json({ success: false, message: 'BACKEND_PUBLIC_URL belum diset' });
  }

  const webhookUrl = manualWebhookUrl || `${backendUrl}/telegram/webhook`;
  if (!/^https:\/\/.+\/telegram\/webhook$/.test(webhookUrl)) {
    return res.status(400).json({ success: false, message: 'webhook_url harus HTTPS dan berakhir /telegram/webhook' });
  }
  const body = new URLSearchParams();
  body.set('url', webhookUrl);
  if (webhookSecret) body.set('secret_token', webhookSecret);
  body.set('drop_pending_updates', 'false');

  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    return res.status(400).json({ success: false, message: payload?.description || 'Gagal set webhook' });
  }

  return res.json({ success: true, message: 'Webhook Telegram berhasil diset', data: { url: webhookUrl } });
}

export async function deleteTelegramWebhook(_req, res) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return res.status(400).json({ success: false, message: 'TELEGRAM_BOT_TOKEN belum diset' });
  }

  const body = new URLSearchParams();
  body.set('drop_pending_updates', 'false');
  const response = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    return res.status(400).json({ success: false, message: payload?.description || 'Gagal hapus webhook' });
  }

  return res.json({ success: true, message: 'Webhook Telegram berhasil dihapus' });
}

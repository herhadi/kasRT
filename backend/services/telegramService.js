const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_TIMEOUT_MS = 15_000;

function isConfigured() {
  return Boolean(BOT_TOKEN);
}

function maskChatId(chatId) {
  const value = String(chatId || '').trim();
  if (value.length <= 4) return value ? '****' : '';
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function describeTelegramError(error, controller) {
  const cause = error?.cause;
  const timedOut = error?.name === 'AbortError' || controller?.signal?.aborted;
  return {
    type: timedOut ? 'timeout' : (cause?.code || error?.code || error?.name || 'request_error'),
    message: timedOut ? `request timeout setelah ${TELEGRAM_TIMEOUT_MS}ms` : (error?.message || String(error)),
    cause_code: cause?.code || error?.code || null,
    cause_message: cause?.message || null,
    syscall: cause?.syscall || error?.syscall || null,
    hostname: cause?.hostname || error?.hostname || null
  };
}

export async function sendTelegramMessage(chatId, text) {
  if (!isConfigured() || !chatId) {
    console.warn('[TELEGRAM] message skipped', JSON.stringify({
      reason: !isConfigured() ? 'bot_token_missing' : 'chat_id_missing',
      chat_id: maskChatId(chatId)
    }));
    return { success: false, skipped: true };
  }

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: String(chatId).trim(),
        text,
        parse_mode: 'HTML'
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text();
      const details = {
        type: 'http_error',
        status: response.status,
        status_text: response.statusText || null,
        body: body.slice(0, 500)
      };
      console.error('[TELEGRAM] sendMessage failed', JSON.stringify({
        chat_id: maskChatId(chatId),
        ...details
      }));
      return { success: false, error: `Telegram HTTP ${response.status}: ${body.slice(0, 500)}` };
    }

    return { success: true };
  } catch (error) {
    const details = describeTelegramError(error, controller);
    console.error('[TELEGRAM] sendMessage request failed', JSON.stringify({
      chat_id: maskChatId(chatId),
      ...details
    }));
    return { success: false, error: `${details.type}: ${details.message}` };
  } finally {
    clearTimeout(timeout);
  }
}

export function formatRupiah(amount) {
  return `Rp ${new Intl.NumberFormat('id-ID').format(Number(amount || 0))}`;
}

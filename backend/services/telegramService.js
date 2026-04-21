const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

function isConfigured() {
  return Boolean(BOT_TOKEN);
}

export async function sendTelegramMessage(chatId, text) {
  if (!isConfigured() || !chatId) {
    return { success: false, skipped: true };
  }

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: String(chatId).trim(),
        text,
        parse_mode: 'HTML'
      })
    });

    if (!response.ok) {
      const body = await response.text();
      return { success: false, error: body };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export function formatRupiah(amount) {
  return `Rp ${new Intl.NumberFormat('id-ID').format(Number(amount || 0))}`;
}

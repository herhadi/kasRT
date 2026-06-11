function normalizePhone(value) {
  const raw = String(value || '').replace(/[^\d]/g, '');
  if (!raw) return '';
  if (raw.startsWith('62')) return raw;
  if (raw.startsWith('0')) return `62${raw.slice(1)}`;
  return raw;
}

export async function sendFonnteMessage(target, message) {
  const token = String(process.env.FONNTE_TOKEN || '').trim();
  if (!token) return { sent: false, skipped: true, reason: 'FONNTE_TOKEN belum diset' };

  const normalizedTarget = normalizePhone(target);
  if (!normalizedTarget) return { sent: false, skipped: true, reason: 'target invalid' };

  const endpoint = 'https://api.fonnte.com/send';
  const body = new URLSearchParams();
  body.set('target', normalizedTarget);
  body.set('message', String(message || ''));

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const messageText = payload?.reason || payload?.message || `HTTP ${response.status}`;
    throw new Error(`Fonnte error: ${messageText}`);
  }
  if (payload?.status === false) {
    const messageText = payload?.reason || payload?.message || 'Fonnte menolak request';
    throw new Error(`Fonnte error: ${messageText}`);
  }

  return { sent: true, target: normalizedTarget, raw: payload };
}

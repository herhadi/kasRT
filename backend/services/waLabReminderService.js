const DEFAULT_TIMEOUT_MS = 30_000;

function readBool(key, fallback = false) {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
}

function readInt(key, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  const normalized = digits.startsWith('0') ? `62${digits.slice(1)}` : digits;
  if (!/^62\d{8,14}$/.test(normalized)) return null;
  return normalized;
}

function gatewayBaseUrl() {
  const raw =
    process.env.WA_LAB_BASE_URL ||
    process.env.WA_GATEWAY_BASE_URL ||
    process.env.WA_GATEWAY_URL ||
    '';
  if (!raw) return '';
  return String(raw).trim().replace(/\/send$/, '').replace(/\/+$/, '');
}

function gatewaySecret() {
  return String(process.env.WA_LAB_SECRET || process.env.WA_GATEWAY_SECRET || '').trim();
}

export function isWaJimpitanReminderEnabled() {
  return readBool('WA_JIMPITAN_REMINDER_ENABLED', false);
}

export function getWaJimpitanMaxRecipients() {
  return readInt('WA_JIMPITAN_MAX_RECIPIENTS', 1, { min: 1, max: 3 });
}

export function getWaLabMinConnectedAgeMinutes() {
  return readInt('WA_LAB_MIN_CONNECTED_AGE_MINUTES', 180, { min: 0, max: 1440 });
}

export function pickRandomValidWaRecipients(rows = [], limit = getWaJimpitanMaxRecipients()) {
  const candidates = rows
    .map((row) => ({
      id: row.id,
      nama: row.nama || row.jimpitan_label || null,
      phone: normalizePhone(row.no_hp)
    }))
    .filter((row) => row.phone);

  const uniqueCandidates = Array.from(new Map(candidates.map((row) => [row.phone, row])).values());
  return uniqueCandidates
    .map((row) => ({ row, sort: Math.random() }))
    .sort((left, right) => left.sort - right.sort)
    .slice(0, Math.max(0, Number(limit || 0)))
    .map((item) => item.row);
}

async function checkGatewayCooldown({ baseUrl, secret, signal }) {
  const minAgeMinutes = getWaLabMinConnectedAgeMinutes();
  if (minAgeMinutes <= 0) return { success: true };

  const response = await fetch(`${baseUrl}/status`, {
    headers: { 'x-wa-lab-secret': secret },
    signal
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.success !== true) {
    return { success: false, error: data?.message || `Status WA Lab HTTP ${response.status}` };
  }
  if (data.data?.connected !== true) return { success: false, error: 'WA Lab belum connected' };

  const connectedAt = data.data?.first_linked_at
    ? new Date(data.data.first_linked_at).getTime()
    : data.data?.last_connected_at
      ? new Date(data.data.last_connected_at).getTime()
      : NaN;
  if (!Number.isFinite(connectedAt)) return { success: false, error: 'WA Lab belum punya waktu connected' };

  const ageMinutes = Math.floor((Date.now() - connectedAt) / 60_000);
  if (ageMinutes < minAgeMinutes) {
    return {
      success: false,
      error: `WA Lab baru connected ${ageMinutes} menit, tunggu minimal ${minAgeMinutes} menit`
    };
  }

  return { success: true };
}

export async function sendWaJimpitanReminder({ recipient, text }) {
  if (!isWaJimpitanReminderEnabled()) {
    return { skipped: true, reason: 'WA_JIMPITAN_REMINDER_ENABLED bukan true' };
  }

  const baseUrl = gatewayBaseUrl();
  const secret = gatewaySecret();
  if (!baseUrl) return { success: false, error: 'WA_LAB_BASE_URL/WA_GATEWAY_BASE_URL belum diisi' };
  if (!secret) return { success: false, error: 'WA_LAB_SECRET/WA_GATEWAY_SECRET belum diisi' };
  if (!recipient?.phone) return { success: false, error: 'Nomor WA recipient tidak valid' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const cooldown = await checkGatewayCooldown({ baseUrl, secret, signal: controller.signal });
    if (cooldown.success !== true) return cooldown;

    const response = await fetch(`${baseUrl}/chats/start`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-wa-lab-secret': secret
      },
      body: JSON.stringify({
        phone: recipient.phone,
        name: recipient.nama || recipient.phone,
        text
      }),
      signal: controller.signal
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.success !== true) {
      return {
        success: false,
        error: data?.message || `HTTP ${response.status}`
      };
    }
    return {
      success: true,
      jid: data.data?.jid || null,
      message_id: data.data?.message_id || null
    };
  } catch (error) {
    return { success: false, error: error.name === 'AbortError' ? 'timeout' : error.message };
  } finally {
    clearTimeout(timeout);
  }
}

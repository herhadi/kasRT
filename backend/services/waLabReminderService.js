import { getAppSetting } from '../models/appSettingModel.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_WA_JIMPITAN_SETTINGS = Object.freeze({
  enabled: false,
  max_recipients: 1,
  selection_mode: 'random',
  min_connected_age_minutes: 180,
  group_jid: ''
});

export function normalizeWaPhone(phone) {
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
  return String(process.env.WA_LAB_SECRET || '').trim();
}

export async function getWaJimpitanReminderSettings() {
  const saved = await getAppSetting('wa_jimpitan_reminder', null);
  if (!saved || typeof saved !== 'object') return { ...DEFAULT_WA_JIMPITAN_SETTINGS, source: 'default' };
  const maxRecipients = Number.parseInt(String(saved.max_recipients), 10);
  const minConnectedAgeMinutes = Number.parseInt(String(saved.min_connected_age_minutes), 10);
  return {
    enabled: typeof saved.enabled === 'boolean' ? saved.enabled : DEFAULT_WA_JIMPITAN_SETTINGS.enabled,
    max_recipients: Number.isInteger(maxRecipients)
      ? Math.min(Math.max(maxRecipients, 1), 20)
      : DEFAULT_WA_JIMPITAN_SETTINGS.max_recipients,
    selection_mode: saved.selection_mode === 'all' ? 'all' : DEFAULT_WA_JIMPITAN_SETTINGS.selection_mode,
    min_connected_age_minutes: Number.isInteger(minConnectedAgeMinutes)
      ? Math.min(Math.max(minConnectedAgeMinutes, 0), 1440)
      : DEFAULT_WA_JIMPITAN_SETTINGS.min_connected_age_minutes,
    group_jid: typeof saved.group_jid === 'string' ? saved.group_jid.trim() : DEFAULT_WA_JIMPITAN_SETTINGS.group_jid,
    source: 'management'
  };
}

export function getWaJimpitanMaxRecipients() {
  return DEFAULT_WA_JIMPITAN_SETTINGS.max_recipients;
}

export function getWaLabMinConnectedAgeMinutes() {
  return DEFAULT_WA_JIMPITAN_SETTINGS.min_connected_age_minutes;
}

export async function pickRandomValidWaRecipients(rows = [], limit = getWaJimpitanMaxRecipients(), getUnsentPhones = null) {
  const candidates = rows
    .map((row) => ({
      id: row.id,
      nama: row.nama || row.jimpitan_label || null,
      phone: normalizeWaPhone(row.no_hp)
    }))
    .filter((row) => row.phone);

  const uniqueCandidates = Array.from(new Map(candidates.map((row) => [row.phone, row])).values());
  const eligible = getUnsentPhones
    ? new Set(await getUnsentPhones(uniqueCandidates.map((item) => item.phone)))
    : null;
  return uniqueCandidates
    .filter((row) => !eligible || eligible.has(row.phone))
    .map((row) => ({ row, sort: Math.random() }))
    .sort((left, right) => left.sort - right.sort)
    .slice(0, Math.max(0, Number(limit || 0)))
    .map((item) => item.row);
}

async function checkGatewayCooldown({ baseUrl, secret, signal, minAgeMinutes = getWaLabMinConnectedAgeMinutes() }) {
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

export async function sendWaJimpitanReminder({ recipient, text, settings = null }) {
  const activeSettings = settings || await getWaJimpitanReminderSettings();
  if (!activeSettings.enabled) {
    return { skipped: true, reason: 'Reminder WA belum diaktifkan di /management/whatsapp' };
  }

  const baseUrl = gatewayBaseUrl();
  const secret = gatewaySecret();
  if (!baseUrl) return { success: false, error: 'WA_LAB_BASE_URL/WA_GATEWAY_BASE_URL belum diisi' };
  if (!secret) return { success: false, error: 'WA_LAB_SECRET belum diisi' };
  if (!recipient?.phone) return { success: false, error: 'Nomor WA recipient tidak valid' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const cooldown = await checkGatewayCooldown({
      baseUrl,
      secret,
      signal: controller.signal,
      minAgeMinutes: activeSettings.min_connected_age_minutes
    });
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

export async function sendWaDirectMessage({ phone, text }) {
  const baseUrl = gatewayBaseUrl();
  const secret = gatewaySecret();
  if (!baseUrl || !secret) return { success: false, error: 'WA Gateway belum dikonfigurasi' };
  const response = await fetch(`${baseUrl}/chats/start`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-wa-lab-secret': secret }, body: JSON.stringify({ phone: normalizeWaPhone(phone), text }) });
  const data = await response.json().catch(() => null);
  return response.ok && data?.success === true ? { success: true } : { success: false, error: data?.message || `HTTP ${response.status}` };
}

export async function sendWaJimpitanGroupMessage({ text }) {
  const baseUrl = gatewayBaseUrl();
  const secret = gatewaySecret();
  const settings = await getWaJimpitanReminderSettings();
  const jid = String(settings.group_jid || '').trim();
  if (!baseUrl || !secret || !jid) return { skipped: true, reason: 'WA_JIMPITAN_GROUP_JID belum dikonfigurasi' };

  const response = await fetch(`${baseUrl}/groups/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-wa-lab-secret': secret },
    body: JSON.stringify({ jid, text })
  });
  const data = await response.json().catch(() => null);
  return response.ok && data?.success === true
    ? { success: true, jid, message_id: data.data?.message_id || null }
    : { success: false, error: data?.message || `HTTP ${response.status}` };
}

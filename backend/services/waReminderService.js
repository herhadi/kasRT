import { sendFonnteMessage } from './fonnteService.js';
import { getAppSetting, upsertAppSetting } from '../models/appSettingModel.js';

const DEFAULT_MIN_DELAY_MS = 30000;
const DEFAULT_MAX_DELAY_MS = 120000;
const WA_REMINDER_SETTING_KEY = 'wa_reminder';

export function normalizeWaPhone(value) {
  const raw = String(value || '').replace(/[^\d]/g, '');
  if (!raw) return '';
  if (raw.startsWith('62')) return raw;
  if (raw.startsWith('0')) return `62${raw.slice(1)}`;
  return raw;
}

export function isValidWaPhone(value) {
  const normalized = normalizeWaPhone(value);
  return /^628\d{7,13}$/.test(normalized);
}

function getEnvWaProvider() {
  const provider = String(process.env.WA_REMINDER_PROVIDER || '').trim().toLowerCase();
  if (provider) return provider;
  return String(process.env.FONNTE_TOKEN || '').trim() ? 'fonnte' : 'off';
}

export async function getWaReminderConfig() {
  const setting = await getAppSetting(WA_REMINDER_SETTING_KEY, null);
  const provider = String(setting?.provider || getEnvWaProvider()).trim().toLowerCase();
  const allowedProvider = ['off', 'fonnte', 'http'].includes(provider) ? provider : 'off';
  return {
    provider: allowedProvider,
    updated_at: setting?.updated_at || null
  };
}

export async function updateWaReminderConfig({ provider, updatedBy }) {
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  if (!['off', 'fonnte', 'http'].includes(normalizedProvider)) {
    throw new Error('Provider WA tidak valid');
  }

  const value = {
    provider: normalizedProvider,
    updated_at: new Date().toISOString()
  };

  await upsertAppSetting({
    keyName: WA_REMINDER_SETTING_KEY,
    value,
    updatedBy
  });

  return value;
}

function getDelayConfig() {
  const min = Number(process.env.WA_REMINDER_MIN_DELAY_MS || DEFAULT_MIN_DELAY_MS);
  const max = Number(process.env.WA_REMINDER_MAX_DELAY_MS || DEFAULT_MAX_DELAY_MS);
  const safeMin = Number.isFinite(min) && min >= 0 ? min : DEFAULT_MIN_DELAY_MS;
  const safeMax = Number.isFinite(max) && max >= safeMin ? max : Math.max(safeMin, DEFAULT_MAX_DELAY_MS);
  return { min: safeMin, max: safeMax };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(min, max) {
  if (max <= 0) return 0;
  if (max <= min) return min;
  return Math.floor(min + Math.random() * (max - min + 1));
}

async function sendHttpGatewayMessage(target, message, recipient = {}) {
  const endpoint = String(process.env.WA_GATEWAY_URL || '').trim();
  const secret = String(process.env.WA_GATEWAY_SECRET || '').trim();
  if (!endpoint) return { sent: false, skipped: true, reason: 'WA_GATEWAY_URL belum diset' };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { 'x-wa-gateway-secret': secret } : {})
    },
    body: JSON.stringify({
      target,
      message,
      recipient: {
        id: recipient.user_id || recipient.warga_id || null,
        nama: recipient.nama || null
      }
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false || payload?.sent === false) {
    const messageText = payload?.message || payload?.reason || `HTTP ${response.status}`;
    throw new Error(`WA gateway error: ${messageText}`);
  }

  return { sent: true, target, raw: payload };
}

export async function getWaReminderStatus() {
  const config = await getWaReminderConfig();
  const provider = config.provider;
  return {
    provider,
    enabled: provider !== 'off',
    queue: provider === 'http',
    delay: getDelayConfig(),
    updated_at: config.updated_at
  };
}

export async function sendWaReminderBatch(recipients, message, options = {}) {
  const config = await getWaReminderConfig();
  const provider = config.provider;
  const enabled = provider !== 'off';
  const errors = [];
  let sent = 0;
  let failed = 0;

  if (!enabled) {
    return { enabled, provider, sent, failed, errors };
  }

  const validRecipients = [];
  for (const row of recipients || []) {
    const target = normalizeWaPhone(row?.no_hp);
    if (!isValidWaPhone(target)) {
      failed += 1;
      errors.push({
        nama: row?.nama || null,
        no_hp: row?.no_hp || null,
        message: 'Nomor WA invalid. Gunakan format 628xxxxxxxxxx.'
      });
      continue;
    }
    validRecipients.push({ row, target });
  }

  const { min, max } = getDelayConfig();
  const useDelay = provider === 'http' && options.useDelay !== false;

  for (let index = 0; index < validRecipients.length; index += 1) {
    const { row, target } = validRecipients[index];
    const messageText = typeof message === 'function'
      ? String(message(row, { target, index }) || '')
      : String(message || '');
    try {
      if (provider === 'fonnte') {
        const result = await sendFonnteMessage(target, messageText);
        if (result?.sent === true) {
          sent += 1;
        } else {
          failed += 1;
          errors.push({ nama: row?.nama || null, no_hp: row?.no_hp || null, message: result?.reason || 'Fonnte tidak mengirim' });
        }
      } else if (provider === 'http') {
        const result = await sendHttpGatewayMessage(target, messageText, row);
        if (result?.sent === true) {
          sent += 1;
        } else {
          failed += 1;
          errors.push({ nama: row?.nama || null, no_hp: row?.no_hp || null, message: result?.reason || 'WA gateway tidak mengirim' });
        }
      } else {
        failed += 1;
        errors.push({ nama: row?.nama || null, no_hp: row?.no_hp || null, message: `Provider WA tidak dikenal: ${provider}` });
      }
    } catch (error) {
      failed += 1;
      errors.push({
        nama: row?.nama || null,
        no_hp: row?.no_hp || null,
        message: error?.message || String(error || 'WA gagal')
      });
    }

    if (useDelay && index < validRecipients.length - 1) {
      await sleep(randomDelay(min, max));
    }
  }

  return { enabled, provider, sent, failed, errors };
}

import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';

const STATE_DIR = process.env.WA_GATEWAY_STATE_DIR || './state';
const DAILY_UNIQUE_LIMIT = Number(process.env.WA_DAILY_UNIQUE_LIMIT || 10);
const MIN_SEND_INTERVAL_MS = Number(process.env.WA_MIN_SEND_INTERVAL_MS || 90000);

let sendLock = Promise.resolve();

function jakartaDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function statePath() {
  return path.join(STATE_DIR, 'send-limits.json');
}

async function readState() {
  try {
    const raw = await readFile(statePath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

async function writeState(state) {
  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(statePath(), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withLock(fn) {
  const previous = sendLock;
  let release;
  sendLock = new Promise((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}

export async function reserveSendSlot(target) {
  return withLock(async () => {
    const today = jakartaDateKey();
    const state = await readState();
    const current = state.date === today
      ? state
      : { date: today, targets: [], sent_count: 0, last_sent_at: null };

    const targets = Array.isArray(current.targets) ? current.targets.map(String) : [];
    const normalizedTarget = String(target || '').trim();
    const isKnownTarget = targets.includes(normalizedTarget);
    const safeDailyLimit = Number.isFinite(DAILY_UNIQUE_LIMIT) && DAILY_UNIQUE_LIMIT > 0 ? DAILY_UNIQUE_LIMIT : 10;

    if (!isKnownTarget && targets.length >= safeDailyLimit) {
      const error = new Error(`Limit WA harian tercapai: ${targets.length}/${safeDailyLimit} nomor unik`);
      error.code = 'WA_DAILY_LIMIT';
      error.status = 429;
      throw error;
    }

    const lastSentAt = current.last_sent_at ? new Date(current.last_sent_at).getTime() : 0;
    const elapsed = Date.now() - lastSentAt;
    const safeMinInterval = Number.isFinite(MIN_SEND_INTERVAL_MS) && MIN_SEND_INTERVAL_MS >= 0 ? MIN_SEND_INTERVAL_MS : 90000;
    if (lastSentAt && elapsed < safeMinInterval) {
      await sleep(safeMinInterval - elapsed);
    }

    if (!isKnownTarget) targets.push(normalizedTarget);
    current.targets = targets;
    current.sent_count = Number(current.sent_count || 0) + 1;
    current.last_sent_at = new Date().toISOString();
    await writeState(current);

    return {
      date: current.date,
      sent_count: current.sent_count,
      unique_targets: targets.length,
      unique_limit: safeDailyLimit,
      min_interval_ms: safeMinInterval
    };
  });
}

export async function getLimitStatus() {
  const today = jakartaDateKey();
  const state = await readState();
  const current = state.date === today
    ? state
    : { date: today, targets: [], sent_count: 0, last_sent_at: null };
  const targets = Array.isArray(current.targets) ? current.targets : [];
  const safeDailyLimit = Number.isFinite(DAILY_UNIQUE_LIMIT) && DAILY_UNIQUE_LIMIT > 0 ? DAILY_UNIQUE_LIMIT : 10;
  return {
    date: current.date,
    sent_count: Number(current.sent_count || 0),
    unique_targets: targets.length,
    unique_limit: safeDailyLimit,
    remaining_unique_targets: Math.max(safeDailyLimit - targets.length, 0),
    min_interval_ms: Number.isFinite(MIN_SEND_INTERVAL_MS) && MIN_SEND_INTERVAL_MS >= 0 ? MIN_SEND_INTERVAL_MS : 90000,
    last_sent_at: current.last_sent_at || null
  };
}

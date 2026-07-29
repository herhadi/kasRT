import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readNumber(key, fallback) {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function resolveFromRoot(value, fallback) {
  const target = value || fallback;
  return path.isAbsolute(target) ? target : path.resolve(rootDir, target);
}

export const config = {
  port: readNumber('PORT', 3010),
  secret: String(process.env.WA_LAB_SECRET || process.env.WA_GATEWAY_SECRET || '').trim(),
  authDir: resolveFromRoot(process.env.WA_AUTH_DIR, './auth'),
  dataDir: resolveFromRoot(process.env.WA_DATA_DIR, './data'),
  antibanStateFile: resolveFromRoot(process.env.WA_ANTIBAN_STATE_FILE, './data/antiban-state.json'),
  logLevel: String(process.env.WA_LOG_LEVEL || 'silent'),
  dailyUniqueLimit: readNumber('WA_LAB_DAILY_UNIQUE_LIMIT', 3),
  minTextLength: readNumber('WA_LAB_MIN_TEXT_LENGTH', 2),
  antiban: {
    preset: process.env.WA_ANTIBAN_PRESET || 'conservative',
    maxPerMinute: readNumber('WA_ANTIBAN_MAX_PER_MINUTE', 2),
    maxPerHour: readNumber('WA_ANTIBAN_MAX_PER_HOUR', 10),
    maxPerDay: readNumber('WA_ANTIBAN_MAX_PER_DAY', 20),
    minDelayMs: readNumber('WA_ANTIBAN_MIN_DELAY_MS', 2_500),
    maxDelayMs: readNumber('WA_ANTIBAN_MAX_DELAY_MS', 7_000),
    newChatDelayMs: readNumber('WA_ANTIBAN_NEW_CHAT_DELAY_MS', 4_000),
    warmupDays: readNumber('WA_ANTIBAN_WARMUP_DAYS', 7),
    logging: String(process.env.WA_ANTIBAN_LOGGING || 'true') !== 'false',
    autoPauseAt: 'medium',
    persist: resolveFromRoot(process.env.WA_ANTIBAN_STATE_FILE, './data/antiban-state.json')
  },
  presence: {
    enabled: true,
    enableCircadianRhythm: true,
    timezone: process.env.TZ || 'Asia/Jakarta',
    activityCurve: 'social',
    circadian: {
      enabled: true,
      profile: 'default',
      timezone: process.env.TZ || 'Asia/Jakarta'
    },
    distractionPauseProbability: 0,
    offlineGapProbability: 0,
    enableTypingModel: true,
    typingMinMs: readNumber('WA_LAB_TYPING_MIN_MS', 1_200),
    typingMaxMs: readNumber('WA_LAB_TYPING_MAX_MS', 8_000)
  }
};

export function assertConfig() {
  if (!config.secret) {
    throw new Error('WA_LAB_SECRET wajib diisi untuk endpoint management.');
  }
}

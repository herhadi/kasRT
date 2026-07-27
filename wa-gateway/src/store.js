import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

const usageFile = path.join(config.dataDir, 'usage.json');

function todayKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

async function ensureDataDir() {
  await fs.mkdir(config.dataDir, { recursive: true });
}

async function readUsage() {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(usageFile, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { date: todayKey(), uniqueRecipients: [] };
  }
}

async function writeUsage(usage) {
  await ensureDataDir();
  await fs.writeFile(usageFile, JSON.stringify(usage, null, 2));
}

export async function getUsage() {
  const usage = await readUsage();
  if (usage.date !== todayKey()) {
    return { date: todayKey(), uniqueRecipients: [] };
  }
  return {
    date: usage.date,
    uniqueRecipients: Array.isArray(usage.uniqueRecipients) ? usage.uniqueRecipients : []
  };
}

export async function assertCanSend(phone) {
  const usage = await getUsage();
  const normalizedPhone = String(phone || '').trim();
  const isKnownToday = usage.uniqueRecipients.includes(normalizedPhone);
  if (!isKnownToday && usage.uniqueRecipients.length >= config.dailyUniqueLimit) {
    throw new Error(`Limit uji coba harian tercapai (${config.dailyUniqueLimit} nomor unik/hari).`);
  }
}

export async function recordSend(phone) {
  const usage = await getUsage();
  const normalizedPhone = String(phone || '').trim();
  if (!usage.uniqueRecipients.includes(normalizedPhone)) {
    usage.uniqueRecipients.push(normalizedPhone);
  }
  await writeUsage(usage);
  return usage;
}

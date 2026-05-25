import { createClient } from 'redis';

const redisUrl = String(process.env.REDIS_URL || '').trim();
let client = null;
let ready = false;
let connecting = null;

async function ensureClient() {
  if (!redisUrl) return null;
  if (ready && client) return client;
  if (connecting) return connecting;

  client = createClient({ url: redisUrl });
  client.on('error', (error) => {
    ready = false;
    console.warn('[CACHE] redis error:', error?.message || error);
  });

  connecting = client.connect()
    .then(() => {
      ready = true;
      connecting = null;
      return client;
    })
    .catch((error) => {
      ready = false;
      connecting = null;
      console.warn('[CACHE] redis connect failed:', error?.message || error);
      return null;
    });

  return connecting;
}

export async function getCacheJson(key) {
  try {
    const c = await ensureClient();
    if (!c) return null;
    const raw = await c.get(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setCacheJson(key, value, ttlSeconds = 60) {
  try {
    const c = await ensureClient();
    if (!c) return false;
    await c.set(key, JSON.stringify(value), { EX: Math.max(1, Number(ttlSeconds) || 60) });
    return true;
  } catch {
    return false;
  }
}

export async function delCache(key) {
  try {
    const c = await ensureClient();
    if (!c) return false;
    await c.del(key);
    return true;
  } catch {
    return false;
  }
}


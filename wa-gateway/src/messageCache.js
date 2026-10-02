const maxMessages = 1_000;
const messageTtlMs = 24 * 60 * 60 * 1_000;
const maxGroups = 100;
const groupTtlMs = 10 * 60 * 1_000;

const messageEntries = new Map();
const groupEntries = new Map();

function messageCacheKey(key) {
  const remoteJid = String(key?.remoteJid || '').trim();
  const id = String(key?.id || '').trim();
  return remoteJid && id ? `${remoteJid}:${id}` : null;
}

function evictExpiredMessages(now = Date.now()) {
  for (const [cacheKey, entry] of messageEntries) {
    if (now - entry.at > messageTtlMs) messageEntries.delete(cacheKey);
  }
  while (messageEntries.size > maxMessages) {
    messageEntries.delete(messageEntries.keys().next().value);
  }
}

function evictExpiredGroups(now = Date.now()) {
  for (const [jid, entry] of groupEntries) {
    if (now - entry.at > groupTtlMs) groupEntries.delete(jid);
  }
  while (groupEntries.size > maxGroups) {
    groupEntries.delete(groupEntries.keys().next().value);
  }
}

export function cacheMessage(message) {
  const key = messageCacheKey(message?.key);
  const content = message?.message;
  if (!key || !content) return;

  messageEntries.delete(key);
  messageEntries.set(key, { at: Date.now(), content });
  evictExpiredMessages();
}

export async function getMessage(key) {
  const cacheKey = messageCacheKey(key);
  if (!cacheKey) return undefined;

  const entry = messageEntries.get(cacheKey);
  if (!entry) return undefined;
  if (Date.now() - entry.at > messageTtlMs) {
    messageEntries.delete(cacheKey);
    return undefined;
  }

  messageEntries.delete(cacheKey);
  messageEntries.set(cacheKey, entry);
  return entry.content;
}

export async function getCachedGroupMetadata(jid, fetchMetadata) {
  const groupJid = String(jid || '').trim();
  if (!groupJid || typeof fetchMetadata !== 'function') return undefined;

  evictExpiredGroups();
  const cached = groupEntries.get(groupJid);
  if (cached) {
    groupEntries.delete(groupJid);
    groupEntries.set(groupJid, cached);
    return cached.metadata;
  }

  const metadata = await fetchMetadata(groupJid);
  if (!metadata) return undefined;
  groupEntries.set(groupJid, { at: Date.now(), metadata });
  evictExpiredGroups();
  return metadata;
}

export function clearMessageCaches() {
  messageEntries.clear();
  groupEntries.clear();
}

export function getMessageCacheStats() {
  evictExpiredMessages();
  evictExpiredGroups();
  return {
    messages: messageEntries.size,
    max_messages: maxMessages,
    message_ttl_hours: messageTtlMs / 3_600_000,
    groups: groupEntries.size,
    max_groups: maxGroups,
    group_ttl_minutes: groupTtlMs / 60_000
  };
}

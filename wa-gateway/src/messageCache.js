const maxMessages = 1_000;
const messageTtlMs = 24 * 60 * 60 * 1_000;
const maxGroups = 100;
const groupTtlMs = 10 * 60 * 1_000;

const messageEntries = new Map();
const groupEntries = new Map();
const messageCacheMetrics = {
  requests: 0,
  hits: 0,
  misses: 0,
  fallback_hits: 0,
  ambiguous_fallbacks: 0
};

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

function findByMessageId(id) {
  const targetId = String(id || '').trim();
  if (!targetId) return undefined;

  const matches = [];
  for (const [cacheKey, entry] of messageEntries) {
    if (cacheKey.endsWith(`:${targetId}`)) matches.push({ cacheKey, entry });
  }
  if (matches.length !== 1) {
    if (matches.length > 1) messageCacheMetrics.ambiguous_fallbacks += 1;
    return undefined;
  }
  return matches[0];
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
  messageCacheMetrics.requests += 1;
  const cacheKey = messageCacheKey(key);
  let entry = cacheKey ? messageEntries.get(cacheKey) : undefined;
  let usedFallback = false;
  let fallback = undefined;
  if (!entry) {
    fallback = findByMessageId(key?.id);
    entry = fallback?.entry;
    usedFallback = Boolean(entry);
  }
  if (!entry) {
    messageCacheMetrics.misses += 1;
    return undefined;
  }
  if (Date.now() - entry.at > messageTtlMs) {
    messageEntries.delete(fallback?.cacheKey || cacheKey);
    messageCacheMetrics.misses += 1;
    return undefined;
  }

  const resolvedKey = fallback?.cacheKey || cacheKey;
  if (resolvedKey) {
    messageEntries.delete(resolvedKey);
    messageEntries.set(resolvedKey, entry);
  }
  messageCacheMetrics.hits += 1;
  if (usedFallback) messageCacheMetrics.fallback_hits += 1;
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
  Object.keys(messageCacheMetrics).forEach((key) => {
    messageCacheMetrics[key] = 0;
  });
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
    group_ttl_minutes: groupTtlMs / 60_000,
    get_message: { ...messageCacheMetrics }
  };
}

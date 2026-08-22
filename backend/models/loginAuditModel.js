import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';

export async function ensureLoginAuditTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS login_audit_logs (
      id UUID PRIMARY KEY,
      user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      user_name TEXT NOT NULL,
      user_phone TEXT,
      roles TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
      ip_address TEXT,
      forwarded_for TEXT,
      country_code VARCHAR(8),
      user_agent TEXT,
      device_type VARCHAR(20),
      browser TEXT,
      operating_system TEXT,
      platform TEXT,
      language TEXT,
      timezone TEXT,
      origin TEXT,
      referer TEXT,
      host TEXT,
      login_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS login_audit_logs_login_at_idx
    ON login_audit_logs (login_at DESC)
  `);
}

export async function recordLoginAudit({ user, roles, context }) {
  await ensureLoginAuditTable();
  await pool.query(
    `INSERT INTO login_audit_logs
      (id, user_id, user_name, user_phone, roles, ip_address, forwarded_for,
       country_code, user_agent, device_type, browser, operating_system,
       platform, language, timezone, origin, referer, host)
     VALUES
      ($1, $2::uuid, $3, $4, $5::text[], $6, $7, $8, $9, $10, $11, $12,
       $13, $14, $15, $16, $17, $18)`,
    [
      randomUUID(), user.id, user.nama, user.no_hp, roles, context.ipAddress,
      context.forwardedFor, context.countryCode, context.userAgent,
      context.deviceType, context.browser, context.operatingSystem,
      context.platform, context.language, context.timezone, context.origin,
      context.referer, context.host
    ]
  );
}

export async function listRecentLoginAudits(limit = 30) {
  await ensureLoginAuditTable();
  const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 30);
  const result = await pool.query(
    `SELECT
       id::text,
       user_id::text,
       user_name,
       user_phone,
       roles,
       ip_address,
       forwarded_for,
       country_code,
       user_agent,
       device_type,
       browser,
       operating_system,
       platform,
       language,
       timezone,
       origin,
       referer,
       host,
       login_at
     FROM login_audit_logs
     ORDER BY login_at DESC, id DESC
     LIMIT $1`,
    [safeLimit]
  );
  return result.rows;
}

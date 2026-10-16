import { pool } from '../db.js';

export async function ensureJimpitanGroupOutboxTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jimpitan_group_notification_outbox (
      id BIGSERIAL PRIMARY KEY,
      month_key VARCHAR(7) NOT NULL,
      operational_date DATE NOT NULL DEFAULT CURRENT_DATE,
      context VARCHAR(80) NOT NULL DEFAULT 'notification',
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'UNCERTAIN', 'SKIPPED')),
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      locked_at TIMESTAMPTZ NULL,
      last_error TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMPTZ NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE jimpitan_group_notification_outbox ADD COLUMN IF NOT EXISTS operational_date DATE`);
  await pool.query(`UPDATE jimpitan_group_notification_outbox SET operational_date = (created_at AT TIME ZONE 'Asia/Jakarta')::date WHERE operational_date IS NULL`);
  await pool.query(`ALTER TABLE jimpitan_group_notification_outbox ALTER COLUMN operational_date SET NOT NULL`);
  await pool.query(`CREATE TABLE IF NOT EXISTS jimpitan_group_message_state (
    operational_date DATE PRIMARY KEY,
    month_key VARCHAR(7) NOT NULL,
    group_jid VARCHAR(120) NOT NULL,
    message_id VARCHAR(200) NOT NULL,
    message_text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_jimpitan_group_outbox_ready ON jimpitan_group_notification_outbox (next_attempt_at, id) WHERE status = 'PENDING'`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_jimpitan_group_outbox_stale ON jimpitan_group_notification_outbox (locked_at) WHERE status = 'PROCESSING'`);
}

export async function enqueueJimpitanGroupNotification({ operationalDate, context = 'notification' }) {
  const date = operationalDate instanceof Date ? operationalDate : new Date(operationalDate);
  if (Number.isNaN(date.getTime())) throw new Error('Tanggal notifikasi Jimpitan tidak valid');
  const monthKey = date.toISOString().slice(0, 7);
  const result = await pool.query(
    `INSERT INTO jimpitan_group_notification_outbox (month_key, operational_date, context)
     VALUES ($1, $2::date, $3) RETURNING id`,
    [monthKey, date.toISOString().slice(0, 10), String(context || 'notification').slice(0, 80)]
  );
  return result.rows[0];
}

export async function claimJimpitanGroupNotification() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Recover jobs left in PROCESSING by a process crash after a 10-minute lease.
    await client.query(`UPDATE jimpitan_group_notification_outbox
      SET status = 'UNCERTAIN', locked_at = NULL, updated_at = NOW(),
          last_error = COALESCE(last_error || E'\\n', '') || 'Stale processing lease expired; delivery outcome unknown, stopped to prevent duplicate send'
      WHERE status = 'PROCESSING' AND locked_at < NOW() - INTERVAL '10 minutes'`);
    const result = await client.query(`
      SELECT id, month_key, operational_date, context, attempts
      FROM jimpitan_group_notification_outbox
      WHERE status = 'PENDING' AND next_attempt_at <= NOW()
      ORDER BY id
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `);
    if (!result.rows.length) {
      await client.query('COMMIT');
      return null;
    }
    const job = result.rows[0];
    await client.query(`UPDATE jimpitan_group_notification_outbox
      SET status = 'PROCESSING', attempts = attempts + 1, locked_at = NOW(), updated_at = NOW()
      WHERE id = $1`, [job.id]);
    await client.query('COMMIT');
    return { ...job, attempts: Number(job.attempts || 0) + 1 };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function finishJimpitanGroupNotification(id, { status, error = null, retryDelayMs = null }) {
  const allowed = new Set(['SENT', 'PENDING', 'FAILED', 'UNCERTAIN', 'SKIPPED']);
  if (!allowed.has(status)) throw new Error(`Status outbox tidak valid: ${status}`);
  await pool.query(`
    UPDATE jimpitan_group_notification_outbox
    SET status = $2,
        last_error = $3,
        next_attempt_at = CASE WHEN $4::bigint IS NULL THEN next_attempt_at ELSE NOW() + ($4::bigint * INTERVAL '1 millisecond') END,
        locked_at = NULL,
        sent_at = CASE WHEN $2::varchar(20) = 'SENT' THEN NOW() ELSE sent_at END,
        updated_at = NOW()
    WHERE id = $1
  `, [id, status, error ? String(error).slice(0, 2000) : null, retryDelayMs]);
}


export async function getJimpitanGroupMessageState(operationalDate) {
  const result = await pool.query(
    `SELECT operational_date, month_key, group_jid, message_id, message_text
     FROM jimpitan_group_message_state WHERE operational_date = $1::date`,
    [operationalDate]
  );
  return result.rows[0] || null;
}

export async function saveJimpitanGroupMessageState({ operationalDate, monthKey, groupJid, messageId, messageText }) {
  await pool.query(`
    INSERT INTO jimpitan_group_message_state
      (operational_date, month_key, group_jid, message_id, message_text)
    VALUES ($1::date, $2::varchar(7), $3::varchar(120), $4::varchar(200), $5::text)
    ON CONFLICT (operational_date) DO UPDATE SET
      month_key = EXCLUDED.month_key,
      group_jid = EXCLUDED.group_jid,
      message_id = EXCLUDED.message_id,
      message_text = EXCLUDED.message_text,
      updated_at = NOW()
  `, [operationalDate, monthKey, groupJid, messageId, messageText]);
}

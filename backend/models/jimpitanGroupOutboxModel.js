import { pool } from '../db.js';

export async function ensureJimpitanGroupOutboxTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jimpitan_group_notification_outbox (
      id BIGSERIAL PRIMARY KEY,
      month_key VARCHAR(7) NOT NULL,
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
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_jimpitan_group_outbox_ready ON jimpitan_group_notification_outbox (next_attempt_at, id) WHERE status = 'PENDING'`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_jimpitan_group_outbox_stale ON jimpitan_group_notification_outbox (locked_at) WHERE status = 'PROCESSING'`);
}

export async function enqueueJimpitanGroupNotification({ operationalDate, context = 'notification' }) {
  const date = operationalDate instanceof Date ? operationalDate : new Date(operationalDate);
  if (Number.isNaN(date.getTime())) throw new Error('Tanggal notifikasi Jimpitan tidak valid');
  const monthKey = date.toISOString().slice(0, 7);
  const result = await pool.query(
    `INSERT INTO jimpitan_group_notification_outbox (month_key, context)
     VALUES ($1, $2) RETURNING id`,
    [monthKey, String(context || 'notification').slice(0, 80)]
  );
  return result.rows[0];
}

export async function claimJimpitanGroupNotification() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Recover jobs left in PROCESSING by a process crash after a 10-minute lease.
    await client.query(`UPDATE jimpitan_group_notification_outbox
      SET status = 'PENDING', locked_at = NULL, next_attempt_at = NOW(), updated_at = NOW(),
          last_error = COALESCE(last_error || E'\\n', '') || 'Recovered stale processing lease'
      WHERE status = 'PROCESSING' AND locked_at < NOW() - INTERVAL '10 minutes'`);
    const result = await client.query(`
      SELECT id, month_key, context, attempts
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
        sent_at = CASE WHEN $2 = 'SENT' THEN NOW() ELSE sent_at END,
        updated_at = NOW()
    WHERE id = $1
  `, [id, status, error ? String(error).slice(0, 2000) : null, retryDelayMs]);
}

import { pool } from '../db.js';

export async function ensureCronHealthTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cron_health_logs (
      id BIGSERIAL PRIMARY KEY,
      job_name VARCHAR(80) NOT NULL,
      source VARCHAR(80) NOT NULL DEFAULT 'unknown',
      status VARCHAR(30) NOT NULL DEFAULT 'OK',
      message TEXT NULL,
      payload JSONB NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_cron_health_logs_job_created_at
    ON cron_health_logs (job_name, created_at DESC)
  `);
}

export async function insertCronHealthLog({ jobName, source, status = 'OK', message = null, payload = null }) {
  await ensureCronHealthTable();
  const result = await pool.query(
    `INSERT INTO cron_health_logs (job_name, source, status, message, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING id::text, job_name, source, status, message, payload, created_at`,
    [jobName, source, status, message, payload ? JSON.stringify(payload) : null]
  );
  return result.rows[0];
}

export async function getLatestCronHealthLog(jobName = 'vercel-cron') {
  await ensureCronHealthTable();
  const result = await pool.query(
    `SELECT id::text, job_name, source, status, message, payload, created_at
     FROM cron_health_logs
     WHERE job_name = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [jobName]
  );
  return result.rows[0] || null;
}


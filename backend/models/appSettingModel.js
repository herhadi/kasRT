import { randomUUID } from 'crypto';
import { pool } from '../db.js';

export async function ensureAppSettingsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id UUID PRIMARY KEY,
      key_name VARCHAR(120) NOT NULL UNIQUE,
      value_json JSONB NOT NULL,
      updated_by UUID REFERENCES users(id),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function getAppSetting(keyName, fallback = null) {
  await ensureAppSettingsTable();
  const result = await pool.query(
    `SELECT value_json FROM app_settings WHERE key_name = $1 LIMIT 1`,
    [keyName]
  );
  return result.rows[0]?.value_json ?? fallback;
}

export async function upsertAppSetting({ keyName, value, updatedBy }) {
  await ensureAppSettingsTable();
  await pool.query(
    `INSERT INTO app_settings (id, key_name, value_json, updated_by, updated_at)
     VALUES ($1, $2, $3::jsonb, $4, NOW())
     ON CONFLICT (key_name)
     DO UPDATE SET value_json = EXCLUDED.value_json, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [randomUUID(), keyName, JSON.stringify(value), updatedBy || null]
  );
}

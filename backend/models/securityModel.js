import { randomUUID } from 'crypto';
import { pool } from '../db.js';

export async function ensureSecurityTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sec_reports (
      id UUID PRIMARY KEY,
      report_date DATE NOT NULL DEFAULT CURRENT_DATE,
      report_time TIME,
      category VARCHAR(40) NOT NULL,
      location TEXT NOT NULL,
      summary TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'BARU' CHECK (status IN ('BARU','DIPROSES','SELESAI')),
      created_by UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function createSecurityReport({ reportDate, reportTime, category, location, summary, createdBy }) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO sec_reports (id, report_date, report_time, category, location, summary, status, created_by)
     VALUES ($1, $2::date, $3::time, $4, $5, $6, 'BARU', $7::uuid)`,
    [id, reportDate, reportTime || null, category, location, summary, createdBy]
  );
  return { id };
}

export async function updateSecurityReportStatus({ id, status }) {
  await pool.query(
    `UPDATE sec_reports SET status = $2, updated_at = NOW() WHERE id = $1::uuid`,
    [id, status]
  );
}

export async function getSecurityReportsByMonth(month) {
  const { rows } = await pool.query(
    `SELECT r.id, r.report_date, r.report_time, r.category, r.location, r.summary, r.status, u.nama AS reporter_name
     FROM sec_reports r
     JOIN users u ON u.id = r.created_by
     WHERE TO_CHAR(r.report_date, 'YYYY-MM') = $1
     ORDER BY r.report_date DESC, r.created_at DESC`,
    [month]
  );
  return rows;
}

import { randomUUID } from 'crypto';
import { pool } from '../db.js';
import { ELIGIBLE_USERS_CLAUSE } from './eligibleUsersSql.js';

export const LINGKUNGAN_MONTHLY_FEE = 20000;

export async function ensureLingkunganTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lh_tariffs (
      id UUID PRIMARY KEY,
      effective_month VARCHAR(7) NOT NULL UNIQUE,
      monthly_fee NUMERIC(18,2) NOT NULL CHECK (monthly_fee > 0),
      created_by UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lh_members (
      warga_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lh_payments (
      id UUID PRIMARY KEY,
      warga_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      month_key VARCHAR(7) NOT NULL,
      amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
      paid_at DATE NOT NULL,
      note TEXT,
      created_by UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS lh_payments_month_idx ON lh_payments (month_key, warga_id)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lh_expenses (
      id UUID PRIMARY KEY,
      expense_date DATE NOT NULL,
      amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
      description TEXT NOT NULL,
      created_by UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const seed = await pool.query(`SELECT 1 FROM lh_tariffs LIMIT 1`);
  if (!seed.rowCount) {
    await pool.query(
      `INSERT INTO lh_tariffs (id, effective_month, monthly_fee, created_by)
       SELECT $1, TO_CHAR(CURRENT_DATE, 'YYYY-MM'), $2, id
       FROM users ORDER BY created_at ASC LIMIT 1`,
      [randomUUID(), LINGKUNGAN_MONTHLY_FEE]
    );
  }
}

export async function ensureLingkunganMembersFromWarga() {
  await pool.query(`
    WITH warga_role AS (
      SELECT DISTINCT u.id
      FROM users u
      JOIN user_roles ur ON ur.user_id = u.id
      JOIN roles r ON r.id = ur.role_id
      WHERE LOWER(TRIM(r.name)) = 'warga' AND ${ELIGIBLE_USERS_CLAUSE}
    ),
    eligible_all AS (
      SELECT u.id FROM users u WHERE ${ELIGIBLE_USERS_CLAUSE}
    ),
    warga_final AS (
      SELECT id FROM warga_role
      UNION
      SELECT id FROM eligible_all
      WHERE NOT EXISTS (SELECT 1 FROM warga_role)
    )
    INSERT INTO lh_members (warga_id, is_active)
    SELECT id, TRUE FROM warga_final
    ON CONFLICT (warga_id) DO NOTHING
  `);
}

export async function getLingkunganSummary(month) {
  const tRows = await pool.query(`SELECT effective_month, monthly_fee FROM lh_tariffs WHERE effective_month <= $1 ORDER BY effective_month ASC`, [month]);
  const tariffs = tRows.rows.map((r) => ({ month: String(r.effective_month), fee: Number(r.monthly_fee) }));
  const activeFee = tariffs.length ? tariffs[tariffs.length - 1].fee : LINGKUNGAN_MONTHLY_FEE;
  const members = await pool.query(
    `WITH m AS (
       SELECT lm.warga_id, u.nama
       FROM lh_members lm JOIN users u ON u.id = lm.warga_id
       WHERE lm.is_active = TRUE
     ),
     p AS (
       SELECT warga_id, COALESCE(SUM(amount),0) AS amount
       FROM lh_payments WHERE month_key = $1 GROUP BY warga_id
     )
     SELECT m.warga_id::text AS warga_id, m.nama, COALESCE(p.amount,0) AS paid_amount
     FROM m LEFT JOIN p ON p.warga_id = m.warga_id
     ORDER BY m.nama`,
    [month]
  );
  const arrearsRows = await pool.query(
    `WITH members AS (SELECT warga_id FROM lh_members WHERE is_active = TRUE),
     months AS (
       SELECT TO_CHAR(m, 'YYYY-MM') AS month_key
       FROM generate_series(
         TO_DATE((SELECT COALESCE(MIN(effective_month), $1) FROM lh_tariffs), 'YYYY-MM'),
         TO_DATE($1, 'YYYY-MM'),
         interval '1 month'
       ) m
     ),
     month_target AS (
       SELECT mo.month_key,
       COALESCE((SELECT t.monthly_fee FROM lh_tariffs t WHERE t.effective_month <= mo.month_key ORDER BY t.effective_month DESC LIMIT 1), $2::numeric) AS target
       FROM months mo
     ),
     paid AS (SELECT warga_id, month_key, SUM(amount) AS paid FROM lh_payments GROUP BY warga_id, month_key)
     SELECT m.warga_id::text AS warga_id, COALESCE(SUM(GREATEST(mt.target - COALESCE(p.paid,0),0)),0) AS total_arrears
     FROM members m CROSS JOIN month_target mt
     LEFT JOIN paid p ON p.warga_id = m.warga_id AND p.month_key = mt.month_key
     GROUP BY m.warga_id`,
    [month, LINGKUNGAN_MONTHLY_FEE]
  );
  const aMap = new Map(arrearsRows.rows.map((r) => [String(r.warga_id), Number(r.total_arrears || 0)]));
  const totals = await pool.query(
    `SELECT
      (SELECT COALESCE(SUM(amount),0) FROM lh_payments WHERE month_key = $1) AS pemasukan,
      (SELECT COALESCE(SUM(amount),0) FROM lh_expenses WHERE TO_CHAR(expense_date,'YYYY-MM') = $1) AS pengeluaran`,
    [month]
  );
  return {
    rows: members.rows.map((r) => ({
      warga_id: String(r.warga_id),
      nama: String(r.nama || ''),
      paid_amount: Number(r.paid_amount || 0),
      target_amount: activeFee,
      arrears: Math.max(activeFee - Number(r.paid_amount || 0), 0),
      total_arrears: Number(aMap.get(String(r.warga_id)) || 0)
    })),
    active_fee: activeFee,
    tariffs,
    pemasukan: Number(totals.rows[0]?.pemasukan || 0),
    pengeluaran: Number(totals.rows[0]?.pengeluaran || 0)
  };
}

export async function setLingkunganTariff({ effectiveMonth, monthlyFee, createdBy }) {
  await pool.query(
    `INSERT INTO lh_tariffs (id, effective_month, monthly_fee, created_by)
     VALUES ($1, $2, $3, $4::uuid)
     ON CONFLICT (effective_month)
     DO UPDATE SET monthly_fee = EXCLUDED.monthly_fee`,
    [randomUUID(), effectiveMonth, monthlyFee, createdBy]
  );
}
export async function listLingkunganTariffs() {
  const rs = await pool.query(`SELECT id::text, effective_month, monthly_fee FROM lh_tariffs ORDER BY effective_month DESC`);
  return rs.rows.map((r) => ({ id: r.id, effective_month: r.effective_month, monthly_fee: Number(r.monthly_fee) }));
}
export async function addLingkunganPayment({ wargaId, month, amount, paidAt, note, createdBy }) {
  await pool.query(
    `INSERT INTO lh_payments (id, warga_id, month_key, amount, paid_at, note, created_by)
     VALUES ($1, $2::uuid, $3, $4, $5::date, $6, $7::uuid)`,
    [randomUUID(), wargaId, month, amount, paidAt, note || null, createdBy]
  );
}
export async function addLingkunganExpense({ date, amount, description, createdBy }) {
  await pool.query(
    `INSERT INTO lh_expenses (id, expense_date, amount, description, created_by)
     VALUES ($1, $2::date, $3, $4, $5::uuid)`,
    [randomUUID(), date, amount, description, createdBy]
  );
}
export async function getLingkunganMonthlyRecapByYear(year) {
  const rows = await pool.query(
    `WITH months AS (
       SELECT TO_CHAR(m, 'YYYY-MM') AS month_key
       FROM generate_series(TO_DATE($1 || '-01', 'YYYY-MM'), TO_DATE($1 || '-12', 'YYYY-MM'), interval '1 month') m
     ),
     p AS (SELECT month_key, COALESCE(SUM(amount),0) AS pemasukan FROM lh_payments WHERE month_key LIKE ($1 || '-%') GROUP BY month_key),
     e AS (SELECT TO_CHAR(expense_date,'YYYY-MM') AS month_key, COALESCE(SUM(amount),0) AS pengeluaran FROM lh_expenses WHERE TO_CHAR(expense_date,'YYYY') = $1 GROUP BY TO_CHAR(expense_date,'YYYY-MM'))
     SELECT m.month_key, COALESCE(p.pemasukan,0) AS pemasukan, COALESCE(e.pengeluaran,0) AS pengeluaran
     FROM months m LEFT JOIN p ON p.month_key = m.month_key LEFT JOIN e ON e.month_key = m.month_key
     ORDER BY m.month_key DESC`,
    [String(year)]
  );
  return rows.rows.map((r) => ({ month: String(r.month_key), pemasukan: Number(r.pemasukan || 0), pengeluaran: Number(r.pengeluaran || 0) }));
}

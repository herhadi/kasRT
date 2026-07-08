import { randomUUID } from 'crypto';
import { pool } from '../db.js';
import { ELIGIBLE_USERS_CLAUSE } from './eligibleUsersSql.js';

export const LINGKUNGAN_MONTHLY_FEE = 20000;
const MEMBER_START_MONTH = '2026-01';

export async function ensureLingkunganTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS module_opening_balances (
      module_key VARCHAR(30) NOT NULL,
      closing_year INT NOT NULL,
      opening_year INT NOT NULL,
      amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      created_by UUID REFERENCES users(id),
      updated_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (module_key, closing_year)
    )
  `);
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
      is_active BOOLEAN NOT NULL DEFAULT FALSE,
      active_from_month VARCHAR(7) NOT NULL DEFAULT '${MEMBER_START_MONTH}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by UUID REFERENCES users(id)
    )
  `);
  await pool.query(`ALTER TABLE lh_members ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id)`);
  await pool.query(`ALTER TABLE lh_members ADD COLUMN IF NOT EXISTS active_from_month VARCHAR(7)`);
  await pool.query(`ALTER TABLE lh_members ALTER COLUMN is_active SET DEFAULT FALSE`);
  await pool.query(
    `UPDATE lh_members
     SET active_from_month = '${MEMBER_START_MONTH}'
     WHERE active_from_month IS NULL`
  );
  await pool.query(`ALTER TABLE lh_members ALTER COLUMN active_from_month SET DEFAULT '${MEMBER_START_MONTH}'`);
  await pool.query(`ALTER TABLE lh_members ALTER COLUMN active_from_month SET NOT NULL`);
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
    INSERT INTO lh_members (warga_id, is_active, active_from_month)
    SELECT id, FALSE, '${MEMBER_START_MONTH}' FROM warga_final
    ON CONFLICT (warga_id) DO NOTHING
  `);
}

export async function listLingkunganMembers() {
  await ensureLingkunganTables();
  await ensureLingkunganMembersFromWarga();
  const rs = await pool.query(
    `WITH base AS (
       SELECT u.id AS warga_id, u.nama
       FROM users u
       WHERE ${ELIGIBLE_USERS_CLAUSE}
     )
     SELECT
       b.warga_id::text AS warga_id,
       b.nama,
       COALESCE(lm.is_active, FALSE) AS is_active,
       COALESCE(lm.active_from_month, TO_CHAR(lm.created_at, 'YYYY-MM')) AS active_from_month,
       lm.updated_by::text AS updated_by
     FROM base b
     LEFT JOIN lh_members lm ON lm.warga_id = b.warga_id
     ORDER BY b.nama`
  );
  return rs.rows;
}

export async function setLingkunganMemberActive({ wargaId, isActive, activeFromMonth, updatedBy }) {
  await ensureLingkunganTables();
  await pool.query(
    `INSERT INTO lh_members (warga_id, is_active, active_from_month, updated_at, updated_by)
     VALUES ($1::uuid, $2::boolean, $3, NOW(), $4::uuid)
     ON CONFLICT (warga_id)
     DO UPDATE SET
       is_active = EXCLUDED.is_active,
       active_from_month = EXCLUDED.active_from_month,
       updated_at = NOW(),
       updated_by = EXCLUDED.updated_by`,
    [wargaId, isActive, activeFromMonth, updatedBy]
  );
  return { warga_id: wargaId, is_active: Boolean(isActive), active_from_month: activeFromMonth, updated_by: updatedBy };
}

export async function getLingkunganSummary(month) {
  const tRows = await pool.query(`SELECT effective_month, monthly_fee FROM lh_tariffs WHERE effective_month <= $1 ORDER BY effective_month ASC`, [month]);
  const tariffs = tRows.rows.map((r) => ({ month: String(r.effective_month), fee: Number(r.monthly_fee) }));
  const activeFee = tariffs.length ? tariffs[tariffs.length - 1].fee : LINGKUNGAN_MONTHLY_FEE;
  const arrearsRows = await pool.query(
    `WITH members AS (
       SELECT lm.warga_id, lm.active_from_month, u.nama
       FROM lh_members lm
       JOIN users u ON u.id = lm.warga_id
       WHERE lm.is_active = TRUE AND lm.active_from_month <= $1
     ),
     months AS (
       SELECT m.warga_id, TO_CHAR(g.month_date, 'YYYY-MM') AS month_key
       FROM members m
       CROSS JOIN LATERAL generate_series(
         TO_DATE(m.active_from_month, 'YYYY-MM'),
         TO_DATE($1, 'YYYY-MM'),
         interval '1 month'
       ) g(month_date)
     ),
     month_target AS (
       SELECT mo.warga_id, mo.month_key,
       COALESCE((SELECT t.monthly_fee FROM lh_tariffs t WHERE t.effective_month <= mo.month_key ORDER BY t.effective_month DESC LIMIT 1), $2::numeric) AS target
       FROM months mo
     ),
     paid_total AS (
       SELECT warga_id, SUM(amount) AS total_paid
       FROM lh_payments
       WHERE month_key <= $1
       GROUP BY warga_id
     ),
     running_targets AS (
       SELECT mt.*,
              SUM(mt.target) OVER (PARTITION BY mt.warga_id ORDER BY mt.month_key ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS target_through_month
       FROM month_target mt
     ),
     allocated AS (
       SELECT rt.*,
              COALESCE(pt.total_paid, 0) AS total_paid,
              LEAST(rt.target, GREATEST(COALESCE(pt.total_paid, 0) - (rt.target_through_month - rt.target), 0)) AS applied_amount
       FROM running_targets rt
       LEFT JOIN paid_total pt ON pt.warga_id = rt.warga_id
     )
     SELECT m.warga_id::text AS warga_id,
            MAX(m.nama) AS nama,
            COALESCE(MAX(a.applied_amount) FILTER (WHERE a.month_key = $1), 0) AS paid_amount,
            COALESCE(MAX(a.target) FILTER (WHERE a.month_key = $1), 0) AS target_amount,
            COALESCE(MAX(a.target - a.applied_amount) FILTER (WHERE a.month_key = $1), 0) AS arrears,
            COALESCE(SUM(a.target - a.applied_amount),0) AS total_arrears,
            GREATEST(MAX(a.total_paid) - SUM(a.target), 0) AS surplus_amount,
            COUNT(*) FILTER (WHERE a.applied_amount < a.target) AS arrears_months,
            COUNT(*) AS chargeable_months
     FROM members m
     JOIN allocated a ON a.warga_id = m.warga_id
     GROUP BY m.warga_id
     ORDER BY MAX(m.nama)`,
    [month, LINGKUNGAN_MONTHLY_FEE]
  );
  const totals = await pool.query(
    `SELECT
      (SELECT COALESCE(SUM(amount),0) FROM lh_payments WHERE month_key = $1) AS pemasukan,
      (SELECT COALESCE(SUM(amount),0) FROM lh_expenses WHERE TO_CHAR(expense_date,'YYYY-MM') = $1) AS pengeluaran,
      (SELECT COALESCE(SUM(amount),0) FROM lh_payments WHERE month_key = $1) -
        (SELECT COALESCE(SUM(amount),0) FROM lh_expenses WHERE TO_CHAR(expense_date,'YYYY-MM') = $1) AS total_saldo,
      (SELECT COALESCE(SUM(amount),0) FROM lh_payments) -
        (SELECT COALESCE(SUM(amount),0) FROM lh_expenses) +
        (SELECT COALESCE(SUM(amount),0) FROM module_opening_balances WHERE module_key = 'lingkungan' AND opening_year <= EXTRACT(YEAR FROM CURRENT_DATE)::int) AS total_kas`,
    [month]
  );
  const openingRows = await pool.query(
    `SELECT
       'opening-lingkungan-' || closing_year::text AS id,
       MAKE_DATE(opening_year, 1, 1)::text AS tanggal,
       closing_year,
       opening_year,
       amount,
       'Saldo awal migrasi Desember ' || closing_year::text AS description
     FROM module_opening_balances
     WHERE module_key = 'lingkungan'
     ORDER BY opening_year DESC, closing_year DESC`
  );
  const expenseRows = await pool.query(
    `SELECT
       id::text AS id,
       expense_date::text AS expense_date,
       amount,
       description,
       TO_CHAR(expense_date, 'YYYY-MM') AS expense_month,
       created_at
     FROM lh_expenses
     ORDER BY expense_date DESC, created_at DESC
     LIMIT 200`
  );
  const latestPaymentRows = await pool.query(
    `SELECT DISTINCT ON (p.warga_id)
       p.warga_id::text AS warga_id,
       p.id::text AS id,
       p.amount,
       p.paid_at::text AS paid_at,
       p.note
     FROM lh_payments p
     WHERE p.month_key = $1
     ORDER BY p.warga_id, p.created_at DESC, p.paid_at DESC`,
    [month]
  );
  const latestPaymentMap = new Map(
    latestPaymentRows.rows.map((r) => [
      String(r.warga_id),
      {
        id: String(r.id),
        amount: Number(r.amount || 0),
        paid_at: String(r.paid_at || ''),
        note: String(r.note || '')
      }
    ])
  );
  return {
    rows: arrearsRows.rows.map((row) => ({
      warga_id: String(row.warga_id),
      nama: String(row.nama || ''),
      paid_amount: Number(row.paid_amount || 0),
      target_amount: Number(row.target_amount || 0),
      arrears: Number(row.arrears || 0),
      total_arrears: Number(row.total_arrears || 0),
      surplus_amount: Number(row.surplus_amount || 0),
      arrears_months: Number(row.arrears_months || 0),
      chargeable_months: Number(row.chargeable_months || 0),
      last_payment: latestPaymentMap.get(String(row.warga_id)) || null
    })),
    active_fee: activeFee,
    tariffs,
    pemasukan: Number(totals.rows[0]?.pemasukan || 0),
    pengeluaran: Number(totals.rows[0]?.pengeluaran || 0),
    total_saldo: Number(totals.rows[0]?.total_saldo || 0),
    total_kas: Number(totals.rows[0]?.total_kas || 0),
    opening_balances: openingRows.rows.map((r) => ({
      id: String(r.id),
      tanggal: String(r.tanggal || ''),
      closing_year: Number(r.closing_year || 0),
      opening_year: Number(r.opening_year || 0),
      amount: Number(r.amount || 0),
      description: String(r.description || '')
    })),
    expenses: expenseRows.rows.map((r) => ({
      id: String(r.id),
      expense_date: String(r.expense_date || ''),
      expense_month: String(r.expense_month || ''),
      amount: Number(r.amount || 0),
      description: String(r.description || '')
    }))
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
  const member = await pool.query(
    `SELECT 1
     FROM lh_members
     WHERE warga_id = $1::uuid
       AND is_active = TRUE
       AND active_from_month <= $2`,
    [wargaId, month]
  );
  if (!member.rowCount) throw new Error('Warga bukan anggota lingkungan aktif pada periode ini');
  await pool.query(
    `INSERT INTO lh_payments (id, warga_id, month_key, amount, paid_at, note, created_by)
     VALUES ($1, $2::uuid, $3, $4, $5::date, $6, $7::uuid)`,
    [randomUUID(), wargaId, month, amount, paidAt, note || null, createdBy]
  );
}
export async function updateLingkunganPayment({ paymentId, amount, paidAt, note }) {
  await ensureLingkunganTables();
  const result = await pool.query(
    `UPDATE lh_payments
     SET amount = $2,
         paid_at = COALESCE($3::date, paid_at),
         note = $4
     WHERE id = $1::uuid
     RETURNING id::text, warga_id::text, month_key, amount, paid_at::text, note`,
    [paymentId, amount, paidAt || null, note || null]
  );
  if (!result.rowCount) throw new Error('Data pembayaran lingkungan tidak ditemukan');
  const row = result.rows[0];
  return {
    id: String(row.id),
    warga_id: String(row.warga_id),
    month: String(row.month_key),
    amount: Number(row.amount || 0),
    paid_at: String(row.paid_at || ''),
    note: String(row.note || '')
  };
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

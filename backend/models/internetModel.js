import { randomUUID } from 'crypto';
import { pool } from '../db.js';
import { ELIGIBLE_USERS_CLAUSE } from './eligibleUsersSql.js';

export const INTERNET_MONTHLY_FEE = 60000;
const MEMBER_START_MONTH = '2026-01';

export async function ensureInternetTables() {
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
    CREATE TABLE IF NOT EXISTS inet_tariffs (
      id UUID PRIMARY KEY,
      effective_month VARCHAR(7) NOT NULL UNIQUE,
      monthly_fee NUMERIC(18,2) NOT NULL CHECK (monthly_fee > 0),
      created_by UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS inet_members (
      warga_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      active_from_month VARCHAR(7) NOT NULL DEFAULT '${MEMBER_START_MONTH}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by UUID REFERENCES users(id)
    )
  `);
  await pool.query(`ALTER TABLE inet_members ADD COLUMN IF NOT EXISTS active_from_month VARCHAR(7)`);
  await pool.query(`ALTER TABLE inet_members ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id)`);
  await pool.query(
    `UPDATE inet_members
     SET active_from_month = '${MEMBER_START_MONTH}'
     WHERE active_from_month IS NULL`
  );
  await pool.query(`ALTER TABLE inet_members ALTER COLUMN active_from_month SET DEFAULT '${MEMBER_START_MONTH}'`);
  await pool.query(`ALTER TABLE inet_members ALTER COLUMN active_from_month SET NOT NULL`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS inet_payments (
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
  await pool.query(`CREATE INDEX IF NOT EXISTS inet_payments_month_idx ON inet_payments (month_key, warga_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS inet_expenses (
      id UUID PRIMARY KEY,
      expense_date DATE NOT NULL,
      amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
      description TEXT NOT NULL,
      created_by UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const seed = await pool.query(`SELECT 1 FROM inet_tariffs LIMIT 1`);
  if (!seed.rowCount) {
    await pool.query(
      `INSERT INTO inet_tariffs (id, effective_month, monthly_fee, created_by)
       SELECT $1, TO_CHAR(CURRENT_DATE, 'YYYY-MM'), $2, id
       FROM users
       ORDER BY created_at ASC
       LIMIT 1`,
      [randomUUID(), INTERNET_MONTHLY_FEE]
    );
  }
}

export async function ensureInternetMembersFromWarga() {
  await pool.query(`
    WITH warga_role AS (
      SELECT DISTINCT u.id
      FROM users u
      JOIN user_roles ur ON ur.user_id = u.id
      JOIN roles r ON r.id = ur.role_id
      WHERE LOWER(TRIM(r.name)) = 'warga' AND ${ELIGIBLE_USERS_CLAUSE}
    ),
    eligible_all AS (
      SELECT u.id
      FROM users u
      WHERE ${ELIGIBLE_USERS_CLAUSE}
    ),
    warga_final AS (
      SELECT id FROM warga_role
      UNION
      SELECT id
      FROM eligible_all
      WHERE NOT EXISTS (SELECT 1 FROM warga_role)
    )
    INSERT INTO inet_members (warga_id, is_active, active_from_month)
    SELECT id, TRUE, '${MEMBER_START_MONTH}' FROM warga_final
    ON CONFLICT (warga_id) DO NOTHING
  `);
}

export async function listInternetMembers() {
  await ensureInternetTables();
  await ensureInternetMembersFromWarga();
  const rs = await pool.query(
    `WITH base AS (
       SELECT u.id AS warga_id, u.nama
       FROM users u
       WHERE ${ELIGIBLE_USERS_CLAUSE}
     )
     SELECT b.warga_id::text AS warga_id, b.nama, COALESCE(im.is_active, FALSE) AS is_active,
       COALESCE(im.active_from_month, TO_CHAR(im.created_at, 'YYYY-MM')) AS active_from_month
     FROM base b
     LEFT JOIN inet_members im ON im.warga_id = b.warga_id
     ORDER BY b.nama`
  );
  return rs.rows;
}

export async function setInternetMemberActive({ wargaId, isActive, activeFromMonth, updatedBy }) {
  await ensureInternetTables();
  await pool.query(
    `INSERT INTO inet_members (warga_id, is_active, active_from_month, updated_at, updated_by)
     VALUES ($1::uuid, $2::boolean, $3, NOW(), $4::uuid)
     ON CONFLICT (warga_id)
     DO UPDATE SET is_active = EXCLUDED.is_active, active_from_month = EXCLUDED.active_from_month,
       updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [wargaId, isActive, activeFromMonth, updatedBy]
  );
  return { warga_id: wargaId, is_active: Boolean(isActive), active_from_month: activeFromMonth, updated_by: updatedBy };
}

export async function resetInternetMembersStartMonth({ activeFromMonth = MEMBER_START_MONTH, updatedBy }) {
  await ensureInternetTables();
  const result = await pool.query(
    `UPDATE inet_members
     SET active_from_month = $1,
         updated_at = NOW(),
         updated_by = $2::uuid
     RETURNING warga_id::text`,
    [activeFromMonth, updatedBy]
  );
  return { active_from_month: activeFromMonth, affected_count: result.rowCount || 0 };
}

export async function getInternetSummary(month) {
  const tariffRows = await pool.query(
    `SELECT effective_month, monthly_fee
     FROM inet_tariffs
     WHERE effective_month <= $1
     ORDER BY effective_month ASC`,
    [month]
  );
  const tariffs = tariffRows.rows.map((r) => ({ month: String(r.effective_month), fee: Number(r.monthly_fee) }));
  const activeFee = tariffs.length ? tariffs[tariffs.length - 1].fee : INTERNET_MONTHLY_FEE;

  const arrearsRows = await pool.query(
    `WITH members AS (
       SELECT im.warga_id, im.active_from_month, u.nama
       FROM inet_members im
       JOIN users u ON u.id = im.warga_id
       WHERE im.is_active = TRUE AND im.active_from_month <= $1
     ),
     months AS (
       SELECT members.warga_id, TO_CHAR(m, 'YYYY-MM') AS month_key
       FROM members
       CROSS JOIN LATERAL generate_series(
         TO_DATE(members.active_from_month, 'YYYY-MM'), TO_DATE($1, 'YYYY-MM'), interval '1 month'
       ) m
     ),
     month_target AS (
       SELECT
         mo.warga_id, mo.month_key,
         COALESCE((
           SELECT t.monthly_fee
           FROM inet_tariffs t
           WHERE t.effective_month <= mo.month_key
           ORDER BY t.effective_month DESC
           LIMIT 1
         ), $2::numeric) AS target
       FROM months mo
     ),
     paid_total AS (
       SELECT warga_id, SUM(amount) AS total_paid
       FROM inet_payments
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
     SELECT
       m.warga_id::text AS warga_id,
       MAX(m.nama) AS nama,
       COALESCE(MAX(a.applied_amount) FILTER (WHERE a.month_key = $1), 0) AS paid_amount,
       COALESCE(MAX(a.target) FILTER (WHERE a.month_key = $1), 0) AS target_amount,
       COALESCE(MAX(a.target - a.applied_amount) FILTER (WHERE a.month_key = $1), 0) AS arrears,
       COALESCE(SUM(a.target - a.applied_amount), 0) AS total_arrears,
       GREATEST(MAX(a.total_paid) - SUM(a.target), 0) AS surplus_amount,
       COUNT(*) FILTER (WHERE a.applied_amount < a.target) AS arrears_months,
       COUNT(*) AS chargeable_months
     FROM members m
     JOIN allocated a ON a.warga_id = m.warga_id
     GROUP BY m.warga_id
     ORDER BY MAX(m.nama)`,
    [month, INTERNET_MONTHLY_FEE]
  );
  const totalInOut = await pool.query(
    `SELECT
      (SELECT COALESCE(SUM(amount),0) FROM inet_payments WHERE month_key = $1) AS pemasukan,
      (SELECT COALESCE(SUM(amount),0) FROM inet_expenses WHERE TO_CHAR(expense_date,'YYYY-MM') = $1) AS pengeluaran,
      (SELECT COALESCE(SUM(amount),0) FROM inet_payments) -
        (SELECT COALESCE(SUM(amount),0) FROM inet_expenses) AS total_kas`,
    [month]
  );
  const expenseRows = await pool.query(
    `SELECT
       id::text AS id,
       expense_date::text AS expense_date,
       TO_CHAR(expense_date, 'YYYY-MM') AS expense_month,
       amount,
       description,
       created_at
     FROM inet_expenses
     ORDER BY expense_date DESC, created_at DESC
     LIMIT 200`
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
      chargeable_months: Number(row.chargeable_months || 0)
    })),
    active_fee: activeFee,
    tariffs,
    pemasukan: Number(totalInOut.rows[0]?.pemasukan || 0),
    pengeluaran: Number(totalInOut.rows[0]?.pengeluaran || 0),
    total_kas: Number(totalInOut.rows[0]?.total_kas || 0),
    expenses: expenseRows.rows.map((row) => ({
      id: String(row.id),
      expense_date: String(row.expense_date || ''),
      expense_month: String(row.expense_month || ''),
      amount: Number(row.amount || 0),
      description: String(row.description || '')
    }))
  };
}

export async function listInternetTariffs() {
  const rs = await pool.query(`SELECT id::text, effective_month, monthly_fee FROM inet_tariffs ORDER BY effective_month DESC`);
  return rs.rows.map((r) => ({ id: r.id, effective_month: r.effective_month, monthly_fee: Number(r.monthly_fee) }));
}

export async function setInternetTariff({ effectiveMonth, monthlyFee, createdBy }) {
  await pool.query(
    `INSERT INTO inet_tariffs (id, effective_month, monthly_fee, created_by)
     VALUES ($1, $2, $3, $4::uuid)
     ON CONFLICT (effective_month)
     DO UPDATE SET monthly_fee = EXCLUDED.monthly_fee`,
    [randomUUID(), effectiveMonth, monthlyFee, createdBy]
  );
}

export async function addInternetPayment({ wargaId, month, amount, paidAt, note, createdBy }) {
  const member = await pool.query(
    `SELECT 1 FROM inet_members
     WHERE warga_id = $1::uuid AND is_active = TRUE AND active_from_month <= $2`,
    [wargaId, month]
  );
  if (!member.rowCount) throw new Error('Warga bukan anggota internet aktif pada periode ini');
  await pool.query(
    `INSERT INTO inet_payments (id, warga_id, month_key, amount, paid_at, note, created_by)
     VALUES ($1, $2::uuid, $3, $4, $5::date, $6, $7::uuid)`,
    [randomUUID(), wargaId, month, amount, paidAt, note || null, createdBy]
  );
}

export async function addInternetExpense({ date, amount, description, createdBy }) {
  await pool.query(
    `INSERT INTO inet_expenses (id, expense_date, amount, description, created_by)
     VALUES ($1, $2::date, $3, $4, $5::uuid)`,
    [randomUUID(), date, amount, description, createdBy]
  );
}

export async function getInternetHistory(month) {
  const payments = await pool.query(
    `SELECT p.id::text, p.paid_at AS tanggal, u.nama, p.amount, p.note, 'PAYMENT' AS kind
     FROM inet_payments p
     JOIN users u ON u.id = p.warga_id
     WHERE p.month_key = $1
     ORDER BY p.paid_at DESC, p.created_at DESC`,
    [month]
  );
  const expenses = await pool.query(
    `SELECT e.id::text, e.expense_date AS tanggal, TO_CHAR(e.expense_date, 'YYYY-MM') AS expense_month,
            '-' AS nama, e.amount, e.description AS note, 'EXPENSE' AS kind
     FROM inet_expenses e
     ORDER BY e.expense_date DESC, e.created_at DESC`,
    []
  );
  return { payments: payments.rows, expenses: expenses.rows };
}

export async function getInternetMonthlyRecapByYear(year) {
  const y = Number(year);
  const rows = await pool.query(
    `WITH months AS (
       SELECT TO_CHAR(m, 'YYYY-MM') AS month_key
       FROM generate_series(
         TO_DATE($1 || '-01', 'YYYY-MM'),
         TO_DATE($1 || '-12', 'YYYY-MM'),
         interval '1 month'
       ) m
     ),
     p AS (
       SELECT month_key, COALESCE(SUM(amount),0) AS pemasukan
       FROM inet_payments
       WHERE month_key LIKE ($1 || '-%')
       GROUP BY month_key
     ),
     e AS (
       SELECT TO_CHAR(expense_date, 'YYYY-MM') AS month_key, COALESCE(SUM(amount),0) AS pengeluaran
       FROM inet_expenses
       WHERE TO_CHAR(expense_date, 'YYYY') = $1
       GROUP BY TO_CHAR(expense_date, 'YYYY-MM')
     )
     SELECT m.month_key, COALESCE(p.pemasukan,0) AS pemasukan, COALESCE(e.pengeluaran,0) AS pengeluaran
     FROM months m
     LEFT JOIN p ON p.month_key = m.month_key
     LEFT JOIN e ON e.month_key = m.month_key
     ORDER BY m.month_key DESC`,
    [String(y)]
  );
  return rows.rows.map((r) => ({
    month: String(r.month_key),
    pemasukan: Number(r.pemasukan || 0),
    pengeluaran: Number(r.pengeluaran || 0)
  }));
}

import { pool } from '../db.js';
import { ELIGIBLE_USERS_CLAUSE } from './eligibleUsersSql.js';
import { randomUUID } from 'crypto';

const KAS_IURAN_WAJIB = 'Kas Iuran Wajib';
const KAS_JIMPITAN = 'Kas Jimpitan';
const KAS_SEWA_ASET = 'Kas Sewa Aset';
const DEFAULT_IURAN_WAJIB_FEE = 30000;

export async function ensureIuranTariffTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS iw_tariffs (
      id UUID PRIMARY KEY,
      effective_month VARCHAR(7) NOT NULL UNIQUE,
      monthly_fee NUMERIC(18,2) NOT NULL CHECK (monthly_fee > 0),
      created_by UUID NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const seed = await pool.query(`SELECT 1 FROM iw_tariffs LIMIT 1`);
  if (seed.rowCount === 0) {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    await pool.query(
      `INSERT INTO iw_tariffs (id, effective_month, monthly_fee)
       VALUES ($1, $2, $3)`,
      [randomUUID(), month, DEFAULT_IURAN_WAJIB_FEE]
    );
  }
}

export async function ensureIuranMemberTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS iw_members (
      warga_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      active_from_month VARCHAR(7) NOT NULL DEFAULT '2026-01',
      updated_by UUID NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function listIuranWajibTariffs() {
  await ensureIuranTariffTable();
  const rs = await pool.query(`SELECT id::text, effective_month, monthly_fee FROM iw_tariffs ORDER BY effective_month DESC`);
  return rs.rows.map((r) => ({ id: r.id, effective_month: String(r.effective_month), monthly_fee: Number(r.monthly_fee) }));
}

export async function upsertIuranWajibTariff({ effectiveMonth, monthlyFee, createdBy }) {
  await ensureIuranTariffTable();
  await pool.query(
    `INSERT INTO iw_tariffs (id, effective_month, monthly_fee, created_by)
     VALUES ($1, $2, $3, $4::uuid)
     ON CONFLICT (effective_month)
     DO UPDATE SET monthly_fee = EXCLUDED.monthly_fee, updated_at = NOW(), created_by = EXCLUDED.created_by`,
    [randomUUID(), effectiveMonth, monthlyFee, createdBy || null]
  );
}

export async function getActiveIuranWajibFeeByMonth(month) {
  await ensureIuranTariffTable();
  const targetMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ''))
    ? String(month)
    : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const rs = await pool.query(
    `SELECT monthly_fee
     FROM iw_tariffs
     WHERE effective_month <= $1
     ORDER BY effective_month DESC
     LIMIT 1`,
    [targetMonth]
  );
  if (!rs.rows.length) return DEFAULT_IURAN_WAJIB_FEE;
  return Number(rs.rows[0].monthly_fee || DEFAULT_IURAN_WAJIB_FEE);
}

export async function listIuranWajibMembers() {
  await ensureIuranMemberTable();
  const result = await pool.query(
    `SELECT
       u.id::text AS warga_id,
       u.nama,
       COALESCE(m.is_active, TRUE) AS is_active,
       COALESCE(m.active_from_month, '2026-01') AS active_from_month
     FROM users u
     LEFT JOIN iw_members m ON m.warga_id = u.id
     WHERE ${ELIGIBLE_USERS_CLAUSE}
     ORDER BY u.nama ASC`
  );
  return result.rows.map((row) => ({
    warga_id: String(row.warga_id),
    nama: String(row.nama || ''),
    is_active: Boolean(row.is_active),
    active_from_month: String(row.active_from_month || '2026-01')
  }));
}

export async function setIuranWajibMemberActive({ wargaId, isActive, activeFromMonth, updatedBy }) {
  await ensureIuranMemberTable();
  await pool.query(
    `INSERT INTO iw_members (warga_id, is_active, active_from_month, updated_by, updated_at)
     VALUES ($1::uuid, $2, $3, $4::uuid, NOW())
     ON CONFLICT (warga_id)
     DO UPDATE SET
       is_active = EXCLUDED.is_active,
       active_from_month = EXCLUDED.active_from_month,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()`,
    [wargaId, Boolean(isActive), activeFromMonth || '2026-01', updatedBy || null]
  );
}

export async function listFinanceWallets() {
  const result = await pool.query(
    `SELECT
       w.id,
       w.name,
       (
         COALESCE(
           CASE
             WHEN y.wallet_id IS NULL THEN 0
             WHEN UPPER(COALESCE(ap.status, 'OPEN')) = 'CLOSED' THEN COALESCE(y.closing_balance, 0)
             ELSE COALESCE(y.opening_balance, 0)
           END,
           0
         ) + COALESCE(m.mutasi, 0)
       ) AS balance
     FROM wallets w
     LEFT JOIN LATERAL (
       SELECT yy.wallet_id, yy.year, yy.opening_balance, yy.closing_balance
       FROM yearly_wallet_balances yy
       WHERE yy.wallet_id = w.id
       ORDER BY yy.year DESC
       LIMIT 1
     ) y ON TRUE
     LEFT JOIN accounting_periods ap ON ap.year = y.year
     LEFT JOIN LATERAL (
       SELECT SUM(
         CASE
           WHEN t.status = 'APPROVED' AND t.target_wallet_id = w.id AND t.type IN ('IN', 'TRANSFER') THEN t.amount
           WHEN t.status = 'APPROVED' AND t.source_wallet_id = w.id AND t.type IN ('OUT', 'TRANSFER') THEN -t.amount
           ELSE 0
         END
       ) AS mutasi
       FROM transactions t
       WHERE (t.target_wallet_id = w.id OR t.source_wallet_id = w.id)
         AND t.created_at >= MAKE_DATE(
           CASE
             WHEN y.wallet_id IS NULL THEN EXTRACT(YEAR FROM CURRENT_DATE)::int
             WHEN UPPER(COALESCE(ap.status, 'OPEN')) = 'CLOSED' THEN y.year + 1
             ELSE y.year
           END,
           1,
           1
         )
     ) m ON TRUE
     WHERE LOWER(name) IN (LOWER($1), LOWER($2), LOWER($3))
     ORDER BY w.name ASC`,
    [KAS_IURAN_WAJIB, KAS_JIMPITAN, KAS_SEWA_ASET]
  );
  return result.rows;
}

export async function listPengeluaranBulanan({ month, limit = 100 } = {}) {
  const isValidMonth = typeof month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
  const result = isValidMonth
    ? await pool.query(
     `SELECT
       t.id,
       t.type AS transaction_type,
       t.status,
       t.amount,
       t.description,
       t.created_at,
       w.name AS wallet_name,
       u.nama AS created_by_nama
     FROM transactions t
     LEFT JOIN wallets w ON w.id = t.source_wallet_id
     LEFT JOIN users u ON u.id::text = t.created_by::text
     WHERE (
         (t.type = 'OUT' AND LOWER(COALESCE(w.name, '')) IN (LOWER($3), LOWER($4)))
         OR (t.type = 'TRANSFER' AND COALESCE(t.description, '') LIKE '[SOCIAL_RECEIPT]%')
       )
       AND (
         t.status = 'APPROVED'
         OR (t.type = 'TRANSFER' AND t.status = 'PENDING')
       )
       AND DATE_TRUNC('month', t.created_at) = DATE_TRUNC('month', TO_DATE($1, 'YYYY-MM'))
     ORDER BY t.created_at DESC
      LIMIT $2`,
      [month, limit, KAS_JIMPITAN, KAS_IURAN_WAJIB]
    )
    : await pool.query(
     `SELECT
       t.id,
       t.type AS transaction_type,
       t.status,
       t.amount,
       t.description,
       t.created_at,
       w.name AS wallet_name,
       u.nama AS created_by_nama
     FROM transactions t
     LEFT JOIN wallets w ON w.id = t.source_wallet_id
     LEFT JOIN users u ON u.id::text = t.created_by::text
     WHERE (
         (t.type = 'OUT' AND LOWER(COALESCE(w.name, '')) IN (LOWER($2), LOWER($3)))
         OR (t.type = 'TRANSFER' AND COALESCE(t.description, '') LIKE '[SOCIAL_RECEIPT]%')
       )
       AND (
         t.status = 'APPROVED'
         OR (t.type = 'TRANSFER' AND t.status = 'PENDING')
       )
       AND DATE_TRUNC('month', t.created_at) = DATE_TRUNC('month', CURRENT_DATE)
     ORDER BY t.created_at DESC
     LIMIT $1`,
      [limit, KAS_JIMPITAN, KAS_IURAN_WAJIB]
    );
  return result.rows;
}

export async function listPendapatanBulanan({ month } = {}) {
  const isValidMonth = typeof month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
  const params = isValidMonth
    ? [month, KAS_IURAN_WAJIB, KAS_JIMPITAN, KAS_SEWA_ASET]
    : [KAS_IURAN_WAJIB, KAS_JIMPITAN, KAS_SEWA_ASET];
  const sql = isValidMonth
    ? `SELECT w.name AS wallet_name, COALESCE(SUM(t.amount), 0) AS total
       FROM transactions t
       JOIN wallets w ON w.id = t.target_wallet_id
       WHERE t.type = 'IN'
         AND t.status = 'APPROVED'
         AND LOWER(w.name) IN (LOWER($2), LOWER($3), LOWER($4))
         AND DATE_TRUNC('month', t.created_at) = DATE_TRUNC('month', TO_DATE($1, 'YYYY-MM'))
       GROUP BY w.name`
    : `SELECT w.name AS wallet_name, COALESCE(SUM(t.amount), 0) AS total
       FROM transactions t
       JOIN wallets w ON w.id = t.target_wallet_id
       WHERE t.type = 'IN'
         AND t.status = 'APPROVED'
         AND LOWER(w.name) IN (LOWER($1), LOWER($2), LOWER($3))
         AND DATE_TRUNC('month', t.created_at) = DATE_TRUNC('month', CURRENT_DATE)
       GROUP BY w.name`;

  const result = await pool.query(sql, params);
  const map = new Map(result.rows.map((r) => [String(r.wallet_name || '').toLowerCase(), Number(r.total || 0)]));
  const iuran = map.get(KAS_IURAN_WAJIB.toLowerCase()) || 0;
  const jimpitan = map.get(KAS_JIMPITAN.toLowerCase()) || 0;
  const sewa_aset = map.get(KAS_SEWA_ASET.toLowerCase()) || 0;
  return { iuran, jimpitan, sewa_aset, total: iuran + jimpitan + sewa_aset };
}

async function findIuranWajibContributionTypeId(client) {
  const result = await client.query(
    `SELECT id
     FROM contribution_types
     WHERE LOWER(TRIM(name)) = 'iuran wajib'
     LIMIT 1`
  );
  if (!result.rows.length) {
    throw new Error('Contribution type Iuran Wajib tidak ditemukan');
  }
  return result.rows[0].id;
}

export async function inputIuranWajibSetoran({ wargaId, amount, createdBy, tanggal = null }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const typeId = await findIuranWajibContributionTypeId(client);
    await client.query(
      `INSERT INTO iuran_transactions (warga_id, contribution_type_id, amount, tanggal)
       VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE))`,
      [wargaId, typeId, amount, tanggal]
    );
    await client.query(
      `INSERT INTO transactions
       (type, target_wallet_id, amount, status, description, created_by, approved_by, approved_at)
       SELECT 'IN', w.id, $1, 'APPROVED', 'Setoran iuran wajib warga', $2, $2, NOW()
       FROM wallets w
       WHERE LOWER(w.name) = LOWER($3)
       LIMIT 1`,
      [amount, createdBy, KAS_IURAN_WAJIB]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function catatPengeluaranBulanan({ walletId, amount, description, createdBy, tanggalKeluar = null }) {
  await pool.query(
    `INSERT INTO transactions
     (type, source_wallet_id, amount, status, description, created_by, created_at)
     VALUES ('OUT', $1, $2, 'PENDING', $3, $4, COALESCE($5::date, NOW()))`,
    [walletId, amount, description, createdBy, tanggalKeluar]
  );
}

export async function listIuranWajibStatusByMonth({ month }) {
  const monthValue = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ''))
    ? String(month)
    : new Date().toISOString().slice(0, 7);
  const monthDate = `${monthValue}-01`;

  await ensureIuranMemberTable();
  const result = await pool.query(
    `WITH warga AS (
     SELECT DISTINCT u.id::text AS warga_id, u.nama
     FROM users u
     LEFT JOIN iw_members m ON m.warga_id = u.id
     WHERE ${ELIGIBLE_USERS_CLAUSE}
       AND COALESCE(m.is_active, TRUE) = TRUE
       AND COALESCE(m.active_from_month, '2026-01') <= $2
     ),
     iuran AS (
       SELECT it.warga_id::text AS warga_id, COALESCE(SUM(it.amount), 0) AS total
       FROM iuran_transactions it
       JOIN contribution_types ct ON ct.id = it.contribution_type_id
       WHERE LOWER(TRIM(ct.name)) = 'iuran wajib'
         AND DATE_TRUNC('month', it.tanggal) = DATE_TRUNC('month', $1::date)
       GROUP BY it.warga_id::text
     )
     SELECT
       w.warga_id,
       w.nama,
       COALESCE(i.total, 0) AS paid_amount
     FROM warga w
     LEFT JOIN iuran i ON i.warga_id = w.warga_id
     ORDER BY w.nama ASC`,
    [monthDate, monthValue]
  );
  return result.rows;
}

async function findContributionTypeIdByName(name) {
  const result = await pool.query(
    `SELECT id FROM contribution_types WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 1`,
    [name]
  );
  if (!result.rows.length) throw new Error(`Contribution type ${name} tidak ditemukan`);
  return Number(result.rows[0].id);
}

export async function listOpeningArrearsByContribution({ year, contributionName }) {
  const contributionTypeId = await findContributionTypeIdByName(contributionName);
  const result = await pool.query(
    `SELECT y.warga_id::text AS warga_id, y.opening_arrears
     FROM yearly_warga_contribution_arrears y
     WHERE y.year = $1
       AND y.contribution_type_id = $2`,
    [year, contributionTypeId]
  );
  return result.rows.map((row) => ({
    warga_id: String(row.warga_id),
    opening_arrears: Number(row.opening_arrears || 0)
  }));
}

export async function upsertOpeningArrearsByContribution({ year, contributionName, items }) {
  const contributionTypeId = await findContributionTypeIdByName(contributionName);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const row of items) {
      const wargaId = String(row.warga_id || '').trim();
      const value = Number(row.opening_arrears || 0);
      if (!wargaId || !Number.isFinite(value) || value < 0) continue;
      await client.query(
        `INSERT INTO yearly_warga_contribution_arrears
         (year, warga_id, contribution_type_id, opening_arrears, updated_at)
         VALUES ($1, $2::uuid, $3, $4, NOW())
         ON CONFLICT (year, warga_id, contribution_type_id)
         DO UPDATE SET opening_arrears = EXCLUDED.opening_arrears, updated_at = NOW()`,
        [year, wargaId, contributionTypeId, value]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

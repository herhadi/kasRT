import { pool } from '../db.js';
import { ELIGIBLE_USERS_CLAUSE } from './eligibleUsersSql.js';

const KAS_IURAN_WAJIB = 'Kas Iuran Wajib';
const KAS_JIMPITAN = 'Kas Jimpitan';

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
     WHERE LOWER(name) IN (LOWER($1), LOWER($2))
     ORDER BY w.name ASC`,
    [KAS_IURAN_WAJIB, KAS_JIMPITAN]
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
  const params = isValidMonth ? [month, KAS_IURAN_WAJIB, KAS_JIMPITAN] : [KAS_IURAN_WAJIB, KAS_JIMPITAN];
  const sql = isValidMonth
    ? `SELECT w.name AS wallet_name, COALESCE(SUM(t.amount), 0) AS total
       FROM transactions t
       JOIN wallets w ON w.id = t.target_wallet_id
       WHERE t.type = 'IN'
         AND t.status = 'APPROVED'
         AND LOWER(w.name) IN (LOWER($2), LOWER($3))
         AND DATE_TRUNC('month', t.created_at) = DATE_TRUNC('month', TO_DATE($1, 'YYYY-MM'))
       GROUP BY w.name`
    : `SELECT w.name AS wallet_name, COALESCE(SUM(t.amount), 0) AS total
       FROM transactions t
       JOIN wallets w ON w.id = t.target_wallet_id
       WHERE t.type = 'IN'
         AND t.status = 'APPROVED'
         AND LOWER(w.name) IN (LOWER($1), LOWER($2))
         AND DATE_TRUNC('month', t.created_at) = DATE_TRUNC('month', CURRENT_DATE)
       GROUP BY w.name`;

  const result = await pool.query(sql, params);
  const map = new Map(result.rows.map((r) => [String(r.wallet_name || '').toLowerCase(), Number(r.total || 0)]));
  const iuran = map.get(KAS_IURAN_WAJIB.toLowerCase()) || 0;
  const jimpitan = map.get(KAS_JIMPITAN.toLowerCase()) || 0;
  return { iuran, jimpitan, total: iuran + jimpitan };
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

  const result = await pool.query(
    `WITH warga AS (
     SELECT DISTINCT u.id::text AS warga_id, u.nama
     FROM users u
     WHERE ${ELIGIBLE_USERS_CLAUSE}
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
    [monthDate]
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

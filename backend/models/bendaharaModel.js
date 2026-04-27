import { pool } from '../db.js';

const KAS_IURAN_WAJIB = 'Kas Iuran Wajib';
const KAS_JIMPITAN = 'Kas Jimpitan';

export async function listFinanceWallets() {
  const result = await pool.query(
    `SELECT id, name
     FROM wallets
     WHERE LOWER(name) IN (LOWER($1), LOWER($2))
     ORDER BY name ASC`,
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
       t.amount,
       t.description,
       t.created_at,
       w.name AS wallet_name,
       u.nama AS created_by_nama
     FROM transactions t
     LEFT JOIN wallets w ON w.id = t.source_wallet_id
     LEFT JOIN users u ON u.id = t.created_by
     WHERE t.type = 'OUT'
       AND t.status = 'APPROVED'
       AND DATE_TRUNC('month', t.created_at) = DATE_TRUNC('month', TO_DATE($1, 'YYYY-MM'))
     ORDER BY t.created_at DESC
      LIMIT $2`,
      [month, limit]
    )
    : await pool.query(
      `SELECT
       t.id,
       t.amount,
       t.description,
       t.created_at,
       w.name AS wallet_name,
       u.nama AS created_by_nama
     FROM transactions t
     LEFT JOIN wallets w ON w.id = t.source_wallet_id
     LEFT JOIN users u ON u.id = t.created_by
     WHERE t.type = 'OUT'
       AND t.status = 'APPROVED'
       AND DATE_TRUNC('month', t.created_at) = DATE_TRUNC('month', CURRENT_DATE)
     ORDER BY t.created_at DESC
     LIMIT $1`,
      [limit]
    );
  return result.rows;
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
     (type, source_wallet_id, amount, status, description, created_by, approved_by, approved_at, created_at)
     VALUES ('OUT', $1, $2, 'APPROVED', $3, $4, $4, NOW(), COALESCE($5::date, NOW()))`,
    [walletId, amount, description, createdBy, tanggalKeluar]
  );
}

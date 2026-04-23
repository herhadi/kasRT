import { pool } from '../db.js';

export async function listPendingJimpitanBatches() {
  const result = await pool.query(
    `SELECT
       jb.id,
       jb.total_amount,
       jb.created_at,
       jb.petugas_id,
       u.nama AS petugas_nama
     FROM jimpitan_batches jb
     LEFT JOIN users u ON u.id = jb.petugas_id
     WHERE jb.status = 'PENDING'
     ORDER BY jb.created_at ASC`
  );

  return result.rows.map((row) => ({
    kind: 'JIMPITAN_BATCH',
    id: row.id,
    title: `Batch Jimpitan #${row.id}`,
    description: `Petugas: ${row.petugas_nama || row.petugas_id}`,
    amount: Number(row.total_amount || 0),
    created_at: row.created_at,
    meta: {
      batch_id: row.id,
      petugas_id: row.petugas_id
    }
  }));
}

export async function listPendingTransactionApprovals() {
  const result = await pool.query(
    `SELECT
       t.id,
       t.type,
       t.amount,
       t.description,
       t.created_at,
       t.created_by,
       u.nama AS created_by_nama,
       sw.name AS source_wallet_name,
       tw.name AS target_wallet_name
     FROM transactions t
     LEFT JOIN users u ON u.id = t.created_by
     LEFT JOIN wallets sw ON sw.id = t.source_wallet_id
     LEFT JOIN wallets tw ON tw.id = t.target_wallet_id
     WHERE t.status = 'PENDING'
       AND t.type IN ('TRANSFER', 'OUT')
     ORDER BY t.created_at ASC`
  );

  return result.rows.map((row) => {
    const isTransfer = row.type === 'TRANSFER';
    return {
      kind: isTransfer ? 'TRANSFER' : 'EXPENSE',
      id: row.id,
      title: `${isTransfer ? 'Transfer' : 'Pengeluaran'} #${row.id}`,
      description: isTransfer
        ? `${row.source_wallet_name || '-'} -> ${row.target_wallet_name || '-'}`
        : `${row.source_wallet_name || '-'}${row.description ? ` | ${row.description}` : ''}`,
      amount: Number(row.amount || 0),
      created_at: row.created_at,
      meta: {
        transaction_id: row.id,
        created_by: row.created_by,
        created_by_nama: row.created_by_nama || null
      }
    };
  });
}

export async function listApprovalHistory({
  includeJimpitan = false,
  includeFinance = false,
  limit = 10,
  offset = 0
}) {
  const selects = [];

  if (includeJimpitan) {
    selects.push(`
      SELECT
        'JIMPITAN_BATCH'::text AS kind,
        jb.id::text AS id,
        ('Batch Jimpitan #' || jb.id::text) AS title,
        ('Petugas: ' || COALESCE(p.nama, jb.petugas_id::text)) AS description,
        COALESCE(jb.total_amount, 0)::numeric AS amount,
        jb.created_at,
        jb.approved_at,
        jb.approved_by::text AS approved_by,
        approver.nama AS approved_by_nama
      FROM jimpitan_batches jb
      LEFT JOIN users p ON p.id = jb.petugas_id
      LEFT JOIN users approver ON approver.id = jb.approved_by
      WHERE jb.status = 'APPROVED'
        AND jb.approved_at IS NOT NULL
    `);
  }

  if (includeFinance) {
    selects.push(`
      SELECT
        (CASE WHEN t.type = 'TRANSFER' THEN 'TRANSFER' ELSE 'EXPENSE' END)::text AS kind,
        t.id::text AS id,
        ((CASE WHEN t.type = 'TRANSFER' THEN 'Transfer' ELSE 'Pengeluaran' END) || ' #' || t.id::text) AS title,
        (CASE
          WHEN t.type = 'TRANSFER' THEN COALESCE(sw.name, '-') || ' -> ' || COALESCE(tw.name, '-')
          ELSE COALESCE(sw.name, '-') || COALESCE(' | ' || NULLIF(t.description, ''), '')
        END) AS description,
        COALESCE(t.amount, 0)::numeric AS amount,
        t.created_at,
        t.approved_at,
        t.approved_by::text AS approved_by,
        approver.nama AS approved_by_nama
      FROM transactions t
      LEFT JOIN wallets sw ON sw.id = t.source_wallet_id
      LEFT JOIN wallets tw ON tw.id = t.target_wallet_id
      LEFT JOIN users approver ON approver.id = t.approved_by
      WHERE t.status = 'APPROVED'
        AND t.approved_at IS NOT NULL
        AND t.type IN ('TRANSFER', 'OUT')
    `);
  }

  if (selects.length === 0) {
    return { total: 0, rows: [] };
  }

  const unionQuery = selects.join('\nUNION ALL\n');

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM (${unionQuery}) history`
  );

  const rowsResult = await pool.query(
    `SELECT *
     FROM (${unionQuery}) history
     ORDER BY approved_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  return {
    total: Number(countResult.rows[0]?.total || 0),
    rows: rowsResult.rows
  };
}

import { pool } from '../db.js';

export async function findWalletById(walletId) {
  const result = await pool.query(
    `SELECT id, name
     FROM wallets
     WHERE id = $1
     LIMIT 1`,
    [walletId]
  );
  return result.rows[0] || null;
}

export async function findWalletByName(walletName) {
  const result = await pool.query(
    `SELECT id, name
     FROM wallets
     WHERE LOWER(name) = LOWER($1)
     LIMIT 1`,
    [walletName]
  );
  return result.rows[0] || null;
}

export async function createTransfer({ fromWallet, toWallet, amount, userId, description = null, status = 'PENDING' }) {
  await pool.query(
    `INSERT INTO transactions
     (type, source_wallet_id, target_wallet_id, amount, status, created_by, description)
     VALUES ('TRANSFER', $1, $2, $3, $4, $5, $6)`,
    [fromWallet, toWallet, amount, status, userId, description]
  );
}

export async function createExpense({ walletId, amount, userId, description }) {
  await pool.query(
    `INSERT INTO transactions
     (type, source_wallet_id, amount, status, created_by, description)
     VALUES ('OUT', $1, $2, 'PENDING', $3, $4)`,
    [walletId, amount, userId, description]
  );
}

export async function approvePendingTransactionByType({ transactionId, approverId, type }) {
  const result = await pool.query(
    `UPDATE transactions
     SET status = 'APPROVED',
         approved_by = $1,
         approved_at = NOW()
     WHERE id = $2
       AND type = $3
       AND status = 'PENDING'
     RETURNING id`,
    [approverId, transactionId, type]
  );
  return result.rows[0] || null;
}

export async function approvePendingTaggedTransfer({ transactionId, approverId, descriptionPrefix }) {
  const result = await pool.query(
    `UPDATE transactions
     SET status = 'APPROVED',
         approved_by = $1,
         approved_at = NOW()
     WHERE id = $2
       AND type = 'TRANSFER'
       AND status = 'PENDING'
       AND description LIKE $3
     RETURNING id`,
    [approverId, transactionId, `${descriptionPrefix}%`]
  );
  return result.rows[0] || null;
}

export async function findTransactionSummary(transactionId) {
  const result = await pool.query(
    `SELECT created_by, amount
     FROM transactions
     WHERE id = $1`,
    [transactionId]
  );
  return result.rows[0] || null;
}

export async function findMonthlyTransferDuplicate({ sourceWalletId, targetWalletId }) {
  const result = await pool.query(
    `SELECT id
     FROM transactions
     WHERE type = 'TRANSFER'
       AND source_wallet_id = $1
       AND target_wallet_id = $2
       AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
       AND status IN ('PENDING', 'APPROVED')
     LIMIT 1`,
    [sourceWalletId, targetWalletId]
  );
  return result.rows[0] || null;
}

export async function findPendingTaggedTransferByDescription(descriptionPrefix) {
  const result = await pool.query(
    `SELECT id
     FROM transactions
     WHERE type = 'TRANSFER'
       AND status = 'PENDING'
       AND description LIKE $1
     LIMIT 1`,
    [`${descriptionPrefix}%`]
  );
  return result.rows[0] || null;
}

export async function listTaggedTransfersByCreator({ createdBy, descriptionPrefix, limit = 20 }) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const result = await pool.query(
    `SELECT
       t.id,
       t.amount,
       t.status,
       t.description,
       t.created_at,
       t.approved_at,
       t.approved_by,
       tw.name AS target_wallet_name
     FROM transactions t
     LEFT JOIN wallets tw ON tw.id = t.target_wallet_id
     WHERE t.type = 'TRANSFER'
       AND t.description LIKE $1
       AND t.created_by::text = $2::text
     ORDER BY t.created_at DESC
     LIMIT $3`,
    [`${descriptionPrefix}%`, String(createdBy), safeLimit]
  );
  return result.rows;
}

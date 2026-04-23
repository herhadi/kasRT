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

export async function createTransfer({ fromWallet, toWallet, amount, userId, description = null }) {
  await pool.query(
    `INSERT INTO transactions
     (type, source_wallet_id, target_wallet_id, amount, status, created_by, description)
     VALUES ('TRANSFER', $1, $2, $3, 'PENDING', $4, $5)`,
    [fromWallet, toWallet, amount, userId, description]
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

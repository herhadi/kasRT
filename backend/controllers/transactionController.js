import { pool } from '../db.js';

//
// 🔁 TRANSFER
//
export async function transfer(req, res) {
  const { from_wallet, to_wallet, amount } = req.body;

  const user_id = req.user.user_id;

  if (from_wallet === to_wallet) {
    return res.status(400).json({
      success: false,
      message: 'Tidak boleh transfer ke wallet yang sama'
    });
  }

  if (amount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Nominal harus lebih dari 0'
    });
  }

  await pool.query(
    `INSERT INTO transactions
     (type, source_wallet_id, target_wallet_id, amount, status, created_by)
     VALUES ('TRANSFER', $1, $2, $3, 'PENDING', $4)`,
    [from_wallet, to_wallet, amount, user_id]
  );

  return res.json({ success: true });
}

//
// ✅ APPROVE TRANSFER
//
export async function approveTransfer(req, res) {
  const { transaction_id } = req.body;

  const approver_id = req.user.user_id;

  await pool.query(
    `UPDATE transactions
     SET status = 'APPROVED',
         approved_by = $1,
         approved_at = NOW()
     WHERE id = $2`,
    [approver_id, transaction_id]
  );

  return res.json({ success: true });
}

//
// 💸 EXPENSE
//
export async function expense(req, res) {
  const { wallet_id, amount, description } = req.body;

  const user_id = req.user.user_id;

  if (amount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Nominal harus lebih dari 0'
    });
  }

  await pool.query(
    `INSERT INTO transactions
     (type, source_wallet_id, amount, status, created_by, description)
     VALUES ('OUT', $1, $2, 'PENDING', $3, $4)`,
    [wallet_id, amount, user_id, description]
  );

  return res.json({ success: true });
}

//
// ✅ APPROVE EXPENSE
//
export async function approveExpense(req, res) {
  const { transaction_id } = req.body;

  const approver_id = req.user.user_id;

  await pool.query(
    `UPDATE transactions
     SET status = 'APPROVED',
         approved_by = $1,
         approved_at = NOW()
     WHERE id = $2`,
    [approver_id, transaction_id]
  );

  return res.json({ success: true });
}
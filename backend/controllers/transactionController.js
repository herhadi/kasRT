import { pool } from '../db.js';
import { notifyRoles, notifyUser } from '../services/approvalNotifier.js';
import { formatRupiah } from '../services/telegramService.js';

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

  const createResult = await pool.query(
    `INSERT INTO transactions
     (type, source_wallet_id, target_wallet_id, amount, status, created_by)
     VALUES ('TRANSFER', $1, $2, $3, 'PENDING', $4)`,
    [from_wallet, to_wallet, amount, user_id]
  );

  await notifyRoles(
    ['Ketua', 'Sekretaris'],
    `🔔 <b>Approval Transfer Dibutuhkan</b>\n` +
      `Pengaju ID: <b>${user_id}</b>\n` +
      `Nominal: <b>${formatRupiah(amount)}</b>\n` +
      `Dari wallet: <b>${from_wallet}</b> ke <b>${to_wallet}</b>`
  );

  return res.json({ success: true });
}

//
// ✅ APPROVE TRANSFER
//
export async function approveTransfer(req, res) {
  const { transaction_id } = req.body;

  const approver_id = req.user.user_id;

  const result = await pool.query(
    `UPDATE transactions
     SET status = 'APPROVED',
         approved_by = $1,
         approved_at = NOW()
     WHERE id = $2
       AND type = 'TRANSFER'
       AND status = 'PENDING'
     RETURNING id`,
    [approver_id, transaction_id]
  );

  if (result.rows.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Transfer tidak ditemukan atau tidak bisa di-approve'
    });
  }

  const info = await pool.query(
    `SELECT created_by, amount FROM transactions WHERE id = $1`,
    [transaction_id]
  );

  if (info.rows.length > 0) {
    await notifyUser(
      info.rows[0].created_by,
      `✅ <b>Transfer Disetujui</b>\n` +
        `Transaksi ID: <b>${transaction_id}</b>\n` +
        `Nominal: <b>${formatRupiah(info.rows[0].amount)}</b>`
    );
  }

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

  await notifyRoles(
    ['Ketua', 'Sekretaris'],
    `🔔 <b>Approval Pengeluaran Dibutuhkan</b>\n` +
      `Pengaju ID: <b>${user_id}</b>\n` +
      `Nominal: <b>${formatRupiah(amount)}</b>\n` +
      `Keterangan: <b>${description}</b>`
  );

  return res.json({ success: true });
}

//
// ✅ APPROVE EXPENSE
//
export async function approveExpense(req, res) {
  const { transaction_id } = req.body;

  const approver_id = req.user.user_id;

  const result = await pool.query(
    `UPDATE transactions
     SET status = 'APPROVED',
         approved_by = $1,
         approved_at = NOW()
     WHERE id = $2
       AND type = 'OUT'
       AND status = 'PENDING'
     RETURNING id`,
    [approver_id, transaction_id]
  );

  if (result.rows.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Pengeluaran tidak ditemukan atau tidak bisa di-approve'
    });
  }

  const info = await pool.query(
    `SELECT created_by, amount FROM transactions WHERE id = $1`,
    [transaction_id]
  );

  if (info.rows.length > 0) {
    await notifyUser(
      info.rows[0].created_by,
      `✅ <b>Pengeluaran Disetujui</b>\n` +
        `Transaksi ID: <b>${transaction_id}</b>\n` +
        `Nominal: <b>${formatRupiah(info.rows[0].amount)}</b>`
    );
  }

  return res.json({ success: true });
}

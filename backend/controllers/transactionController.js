import { notifyRoles, notifyUser } from '../services/approvalNotifier.js';
import { formatRupiah } from '../services/telegramService.js';
import {
  approvePendingTransactionByType,
  approvePendingTaggedTransfer,
  createExpense,
  createTransfer,
  findMonthlyTransferDuplicate,
  findTransactionSummary,
  findWalletById,
  findWalletByName
} from '../models/transactionModel.js';

const KAS_JIMPITAN = 'Kas Jimpitan';
const KAS_IURAN_WAJIB = 'Kas Iuran Wajib';
const KAS_SOSIAL = 'Kas Sosial';
const BENDAHARA_SOURCE_WALLETS = [KAS_JIMPITAN, KAS_IURAN_WAJIB];

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

  const sourceWallet = await findWalletById(from_wallet);
  const targetWallet = await findWalletById(to_wallet);

  if (!sourceWallet || !targetWallet) {
    return res.status(400).json({
      success: false,
      message: 'Wallet sumber/tujuan tidak ditemukan'
    });
  }

  if (!BENDAHARA_SOURCE_WALLETS.includes(sourceWallet.name)) {
    return res.status(403).json({
      success: false,
      message: 'Bendahara hanya boleh transfer dari Kas Jimpitan atau Kas Iuran Wajib'
    });
  }

  await createTransfer({
    fromWallet: from_wallet,
    toWallet: to_wallet,
    amount,
    userId: user_id
  });

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

  const approved = await approvePendingTransactionByType({
    transactionId: transaction_id,
    approverId: approver_id,
    type: 'TRANSFER'
  });
  if (!approved) {
    return res.status(400).json({
      success: false,
      message: 'Transfer tidak ditemukan atau tidak bisa di-approve'
    });
  }

  const info = await findTransactionSummary(transaction_id);
  if (info) {
    await notifyUser(
      info.created_by,
      `✅ <b>Transfer Disetujui</b>\n` +
        `Transaksi ID: <b>${transaction_id}</b>\n` +
        `Nominal: <b>${formatRupiah(info.amount)}</b>`
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

  const wallet = await findWalletById(wallet_id);
  if (!wallet) {
    return res.status(400).json({
      success: false,
      message: 'Wallet tidak ditemukan'
    });
  }

  if (!BENDAHARA_SOURCE_WALLETS.includes(wallet.name)) {
    return res.status(403).json({
      success: false,
      message: 'Bendahara hanya boleh input pengeluaran dari Kas Jimpitan atau Kas Iuran Wajib'
    });
  }

  await createExpense({ walletId: wallet_id, amount, userId: user_id, description });

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
// 📤 TRANSFER SOSIAL BULANAN (BENDAHARA)
//
export async function transferSosialBulanan(req, res) {
  const { from_wallet, amount, description } = req.body;
  const user_id = req.user.user_id;

  if (amount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Nominal harus lebih dari 0'
    });
  }

  const sourceWallet = await findWalletById(from_wallet);
  if (!sourceWallet) {
    return res.status(400).json({ success: false, message: 'Wallet sumber tidak ditemukan' });
  }

  if (sourceWallet.name !== KAS_IURAN_WAJIB) {
    return res.status(403).json({
      success: false,
      message: 'Transfer sosial hanya boleh dari Kas Iuran Wajib'
    });
  }

  const kasSosial = await findWalletByName(KAS_SOSIAL);
  if (!kasSosial) {
    return res.status(400).json({
      success: false,
      message: 'Wallet Kas Sosial tidak ditemukan'
    });
  }

  const duplicate = await findMonthlyTransferDuplicate({
    sourceWalletId: sourceWallet.id,
    targetWalletId: kasSosial.id
  });
  if (duplicate) {
    return res.status(400).json({
      success: false,
      message: 'Transfer dana sosial untuk bulan ini sudah diajukan'
    });
  }

  await createTransfer({
    fromWallet: sourceWallet.id,
    toWallet: kasSosial.id,
    amount,
    userId: user_id,
    description: `[SOCIAL_RECEIPT] ${description || 'Setor dana sosial bulanan'}`
  });

  await notifyRoles(
    ['Admin Sosial', 'root'],
    `🔔 <b>Approval Penerimaan Dana Sosial Baru</b>\n` +
      `Pengaju ID: <b>${user_id}</b>\n` +
      `Sumber: <b>${sourceWallet.name}</b>\n` +
      `Tujuan: <b>${KAS_SOSIAL}</b>\n` +
      `Nominal: <b>${formatRupiah(amount)}</b>`
  );
  await notifyRoles(
    ['Ketua', 'Sekretaris'],
    `ℹ️ <b>Informasi Transfer Dana Sosial</b>\n` +
      `Diajukan Bendahara, menunggu konfirmasi Admin Sosial.\n` +
      `Sumber: <b>${sourceWallet.name}</b> • Tujuan: <b>${KAS_SOSIAL}</b>\n` +
      `Nominal: <b>${formatRupiah(amount)}</b>`
  );

  return res.json({ success: true });
}

//
// 💸 PENGELUARAN SOSIAL (ADMIN SOSIAL) -> APPROVAL KETUA/SEKRETARIS
//
export async function expenseSosial(req, res) {
  const { amount, description } = req.body;
  const user_id = req.user.user_id;

  if (amount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Nominal harus lebih dari 0'
    });
  }

  const kasSosial = await findWalletByName(KAS_SOSIAL);
  if (!kasSosial) {
    return res.status(400).json({
      success: false,
      message: 'Wallet Kas Sosial tidak ditemukan'
    });
  }

  await createExpense({
    walletId: kasSosial.id,
    amount,
    userId: user_id,
    description: description || 'Pengeluaran kas sosial'
  });

  await notifyRoles(
    ['Ketua', 'Sekretaris', 'root'],
    `🔔 <b>Approval Pengeluaran Sosial Dibutuhkan</b>\n` +
      `Pengaju ID: <b>${user_id}</b>\n` +
      `Wallet: <b>${KAS_SOSIAL}</b>\n` +
      `Nominal: <b>${formatRupiah(amount)}</b>\n` +
      `Keterangan: <b>${description || '-'}</b>`
  );

  return res.json({ success: true });
}

//
// ✅ APPROVE EXPENSE
//
export async function approveExpense(req, res) {
  const { transaction_id } = req.body;

  const approver_id = req.user.user_id;

  const approved = await approvePendingTransactionByType({
    transactionId: transaction_id,
    approverId: approver_id,
    type: 'OUT'
  });
  if (!approved) {
    return res.status(400).json({
      success: false,
      message: 'Pengeluaran tidak ditemukan atau tidak bisa di-approve'
    });
  }

  const info = await findTransactionSummary(transaction_id);
  if (info) {
    await notifyUser(
      info.created_by,
      `✅ <b>Pengeluaran Disetujui</b>\n` +
        `Transaksi ID: <b>${transaction_id}</b>\n` +
        `Nominal: <b>${formatRupiah(info.amount)}</b>`
    );
  }

  return res.json({ success: true });
}

export async function approveSosialReceipt(req, res) {
  const { transaction_id } = req.body;
  const approver_id = req.user.user_id;

  const approved = await approvePendingTaggedTransfer({
    transactionId: transaction_id,
    approverId: approver_id,
    descriptionPrefix: '[SOCIAL_RECEIPT]'
  });
  if (!approved) {
    return res.status(400).json({
      success: false,
      message: 'Transfer sosial tidak ditemukan atau sudah diproses'
    });
  }

  const info = await findTransactionSummary(transaction_id);
  if (info) {
    await notifyUser(
      info.created_by,
      `✅ <b>Penerimaan Dana Sosial Disetujui Admin Sosial</b>\n` +
        `Transaksi ID: <b>${transaction_id}</b>\n` +
        `Nominal: <b>${formatRupiah(info.amount)}</b>`
    );
  }

  await notifyRoles(
    ['Ketua', 'Sekretaris'],
    `ℹ️ <b>Transfer Dana Sosial Selesai</b>\n` +
      `Transaksi ID: <b>${transaction_id}</b>`
  );

  return res.json({ success: true });
}

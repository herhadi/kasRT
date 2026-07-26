import { delCacheByPrefix } from '../services/cacheService.js';
import { formatRupiah, sendTelegramMessage } from '../services/telegramService.js';
import { notifyRoles, notifyUser } from '../services/approvalNotifier.js';
import {
  approveSpecialBillBatch,
  createSpecialBill,
  createSpecialBillBatch,
  findSpecialBillById,
  getSpecialBillNotificationContext,
  hideSpecialBillFromDashboard,
  listSpecialBillMembers,
  listSpecialBillOptions,
  listSpecialBills,
  listSpecialBillsForPic,
  listSpecialBillPaymentHistory,
  listSpecialBillTargets,
  listTelegramTargetsForBill,
  listVisibleSpecialBillsForWarga,
  recordSpecialBillPayment,
  setSpecialBillMemberActive,
  setSpecialBillTargetActive,
  updateSpecialBillPayment
} from '../models/specialBillModel.js';

function isValidDate(value) {
  return /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(String(value || '').trim());
}

function formatDateId(dateString) {
  const value = String(dateString || '').slice(0, 10);
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value || '-';
  return parsed.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

export async function getSpecialBillOptions(_req, res) {
  const users = await listSpecialBillOptions();
  return res.json({ success: true, data: { users } });
}

export async function getSpecialBills(_req, res) {
  const rows = await listSpecialBills();
  return res.json({ success: true, data: rows });
}

export async function getSpecialBillMembers(_req, res) {
  const rows = await listSpecialBillMembers();
  return res.json({ success: true, data: rows });
}

export async function setSpecialBillMemberActiveHandler(req, res) {
  const wargaId = String(req.body.warga_id || '').trim();
  const isActive = Boolean(req.body.is_active);
  if (!wargaId) return res.status(400).json({ success: false, message: 'Warga wajib dipilih' });
  const row = await setSpecialBillMemberActive({
    wargaId,
    isActive,
    updatedBy: String(req.user?.user_id || '')
  });
  await delCacheByPrefix('dashboard:warga:');
  return res.json({ success: true, data: row });
}

export async function getMyPicSpecialBills(req, res) {
  const rows = await listSpecialBillsForPic(String(req.user?.user_id || ''));
  return res.json({ success: true, data: rows });
}

export async function createSpecialBillHandler(req, res) {
  const title = String(req.body.title || '').trim();
  const description = String(req.body.description || '').trim();
  const amount = Number(req.body.amount || 0);
  const startDate = String(req.body.start_date || '').trim();
  const endDate = String(req.body.end_date || '').trim();
  const picUserId = String(req.body.pic_user_id || '').trim();
  const actorId = String(req.user?.user_id || '').trim();

  if (!title) return res.status(400).json({ success: false, message: 'Nama tagihan wajib diisi' });
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ success: false, message: 'Nominal tagihan tidak valid' });
  if (!isValidDate(startDate) || !isValidDate(endDate)) return res.status(400).json({ success: false, message: 'Tanggal mulai/akhir tidak valid' });
  if (endDate < startDate) return res.status(400).json({ success: false, message: 'Tanggal akhir tidak boleh sebelum tanggal mulai' });
  if (!picUserId) return res.status(400).json({ success: false, message: 'PIC wajib dipilih' });

  const bill = await createSpecialBill({
    title,
    description,
    amount,
    startDate,
    endDate,
    picUserId,
    createdBy: actorId
  });

  await delCacheByPrefix('dashboard:warga:');

  const recipients = await listTelegramTargetsForBill(bill.id);
  const message =
    `📌 <b>Tagihan Khusus RT</b>\n\n` +
    `<b>${title}</b>\n` +
    `Nominal: <b>${formatRupiah(amount)}</b>\n` +
    `Periode: <b>${formatDateId(startDate)} - ${formatDateId(endDate)}</b>\n` +
    `PIC: <b>${bill.pic_name || 'PIC kegiatan'}</b>\n\n` +
    `Silakan cek dashboard KasRT untuk detail tagihan.`;
  await Promise.allSettled(recipients.map((row) => sendTelegramMessage(row.telegram_chat_id, message)));

  return res.json({ success: true, data: bill, notified: recipients.length });
}

export async function hideSpecialBillHandler(req, res) {
  const billId = String(req.params.id || '').trim();
  const actorId = String(req.user?.user_id || '').trim();
  if (!billId) return res.status(400).json({ success: false, message: 'ID tagihan tidak valid' });

  const row = await hideSpecialBillFromDashboard({ billId, actorId });
  if (!row) return res.status(404).json({ success: false, message: 'Tagihan tidak ditemukan' });
  await delCacheByPrefix('dashboard:warga:');
  return res.json({ success: true, data: row, message: 'Tagihan disembunyikan dari dashboard warga.' });
}

export async function getMySpecialBills(req, res) {
  const userId = String(req.user?.user_id || '').trim();
  const rows = await listVisibleSpecialBillsForWarga(userId);
  return res.json({ success: true, data: rows });
}

export async function getSpecialBillTargets(req, res) {
  const billId = String(req.params.id || '').trim();
  if (!billId) return res.status(400).json({ success: false, message: 'ID tagihan tidak valid' });
  await ensureBillOperator(req, billId);
  const rows = await listSpecialBillTargets(billId);
  return res.json({ success: true, data: rows });
}

export async function setSpecialBillTargetActiveHandler(req, res) {
  const billId = String(req.params.id || '').trim();
  const wargaId = String(req.body.warga_id || '').trim();
  const isActive = Boolean(req.body.is_active);
  if (!billId) return res.status(400).json({ success: false, message: 'ID tagihan tidak valid' });
  if (!wargaId) return res.status(400).json({ success: false, message: 'Warga wajib dipilih' });
  const row = await setSpecialBillTargetActive({ billId, wargaId, isActive });
  if (!row) return res.status(404).json({ success: false, message: 'Target warga tidak ditemukan' });
  await delCacheByPrefix('dashboard:warga:');
  return res.json({ success: true, data: row });
}

function userHasAnyRole(req, roles = []) {
  const userRoles = (req.user?.roles || []).map((role) => String(role).trim().toLowerCase());
  return roles.some((role) => userRoles.includes(String(role).trim().toLowerCase()));
}

async function ensureBillOperator(req, billId) {
  if (userHasAnyRole(req, ['Bendahara', 'root'])) return;
  const bill = await findSpecialBillById(billId);
  if (!bill || String(bill.pic_user_id) !== String(req.user?.user_id)) {
    const error = new Error('Akses input tagihan khusus ditolak');
    error.status = 403;
    throw error;
  }
}

export async function recordSpecialBillPaymentHandler(req, res) {
  const billId = String(req.params.id || '').trim();
  const wargaId = String(req.body.warga_id || '').trim();
  const amount = Number(req.body.amount || 0);
  if (!billId) return res.status(400).json({ success: false, message: 'ID tagihan tidak valid' });
  if (!wargaId) return res.status(400).json({ success: false, message: 'Warga wajib dipilih' });
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ success: false, message: 'Nominal pembayaran tidak valid' });
  await ensureBillOperator(req, billId);
  const row = await recordSpecialBillPayment({ billId, wargaId, amount, collectedBy: String(req.user?.user_id || '') });
  if (!row) return res.status(404).json({ success: false, message: 'Target warga aktif tidak ditemukan' });
  await delCacheByPrefix('dashboard:warga:');
  const context = await getSpecialBillNotificationContext({ billId, wargaId, paymentId: row.payment?.id });
  if (context?.warga_id) {
    await notifyUser(
      context.warga_id,
      `✅ <b>Pembayaran Tagihan Khusus Dicatat</b>\n\n` +
        `<b>${context.title}</b>\n` +
        `Nominal diterima PIC: <b>${formatRupiah(row.payment?.amount || amount)}</b>\n` +
        `PIC: <b>${context.pic_name || '-'}</b>\n\n` +
        `Status saat ini: terkumpul di PIC dan menunggu setoran ke Bendahara.`
    ).catch(() => {});
  }
  return res.json({ success: true, data: row, message: 'Pembayaran dicatat sebagai terkumpul di PIC.' });
}

export async function updateSpecialBillPaymentHandler(req, res) {
  const billId = String(req.params.id || '').trim();
  const paymentId = String(req.params.paymentId || '').trim();
  const amount = Number(req.body.amount || 0);
  if (!billId) return res.status(400).json({ success: false, message: 'ID tagihan tidak valid' });
  if (!paymentId) return res.status(400).json({ success: false, message: 'ID pembayaran tidak valid' });
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ success: false, message: 'Nominal koreksi tidak valid' });
  await ensureBillOperator(req, billId);
  const row = await updateSpecialBillPayment({ billId, paymentId, amount, actorId: String(req.user?.user_id || '') });
  if (!row) return res.status(404).json({ success: false, message: 'Pembayaran tidak ditemukan' });
  await delCacheByPrefix('dashboard:warga:');
  const context = await getSpecialBillNotificationContext({ billId, wargaId: row.warga_id, paymentId });
  if (context?.warga_id) {
    await notifyUser(
      context.warga_id,
      `✏️ <b>Pembayaran Tagihan Khusus Dikoreksi</b>\n\n` +
        `<b>${context.title}</b>\n` +
        `Sebelumnya: <b>${formatRupiah(row.old_amount)}</b>\n` +
        `Menjadi: <b>${formatRupiah(row.new_amount)}</b>\n\n` +
        `Status masih terkumpul di PIC sebelum disetor ke Bendahara.`
    ).catch(() => {});
  }
  return res.json({ success: true, data: row, message: 'Pembayaran berhasil dikoreksi.' });
}

export async function getSpecialBillPaymentHistory(req, res) {
  const billId = String(req.params.id || '').trim();
  if (!billId) return res.status(400).json({ success: false, message: 'ID tagihan tidak valid' });
  await ensureBillOperator(req, billId);
  const rows = await listSpecialBillPaymentHistory(billId);
  return res.json({ success: true, data: rows });
}

export async function submitSpecialBillBatchHandler(req, res) {
  const billId = String(req.params.id || '').trim();
  if (!billId) return res.status(400).json({ success: false, message: 'ID tagihan tidak valid' });
  await ensureBillOperator(req, billId);
  const batch = await createSpecialBillBatch({ billId, actorId: String(req.user?.user_id || '') });
  await notifyRoles(
    ['Bendahara', 'root'],
    `📦 <b>Setoran Tagihan Khusus Menunggu Approval</b>\n` +
      `Tagihan: <b>${batch.bill_title}</b>\n` +
      `PIC: <b>${batch.pic_name || '-'}</b>\n` +
      `Nominal: <b>${formatRupiah(batch.total_amount)}</b>\n\n` +
      `Buka menu Approval Bendahara untuk menerima setoran.`
  ).catch(() => {});
  return res.json({ success: true, data: batch, message: 'Setoran tagihan diajukan dan menunggu approval Bendahara.' });
}

export async function approveSpecialBillBatchHandler(req, res) {
  const batchId = String(req.body.batch_id || req.body.id || '').trim();
  if (!batchId) return res.status(400).json({ success: false, message: 'ID batch tidak valid' });
  const approved = await approveSpecialBillBatch({ batchId, approverId: String(req.user?.user_id || '') });
  await delCacheByPrefix('dashboard:warga:');
  const contexts = await getSpecialBillNotificationContext({ batchId });
  await notifyUser(
    approved.pic_user_id,
    `✅ <b>Setoran Tagihan Khusus Diterima Bendahara</b>\n\n` +
      `<b>${approved.title}</b>\n` +
      `Nominal masuk Kas Bendahara: <b>${formatRupiah(approved.amount)}</b>`
  ).catch(() => {});
  if (Array.isArray(contexts)) {
    await Promise.allSettled(contexts.map((row) => notifyUser(
      row.warga_id,
      `✅ <b>Tagihan Khusus Masuk Kas Bendahara</b>\n\n` +
        `<b>${row.title}</b>\n` +
        `Pembayaran Anda: <b>${formatRupiah(row.warga_amount || 0)}</b>\n\n` +
        `Status sudah diterima Bendahara.`
    )));
  }
  return res.json({ success: true, data: approved, message: 'Setoran tagihan khusus diterima Bendahara.' });
}

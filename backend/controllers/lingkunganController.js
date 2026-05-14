import {
  LINGKUNGAN_MONTHLY_FEE,
  addLingkunganExpense,
  addLingkunganPayment,
  ensureLingkunganMembersFromWarga,
  getLingkunganMonthlyRecapByYear,
  listLingkunganMembers,
  getLingkunganSummary,
  setLingkunganMemberActive,
  listLingkunganTariffs,
  setLingkunganTariff
} from '../models/lingkunganModel.js';
import { notifyUser } from '../services/approvalNotifier.js';
import { formatRupiah } from '../services/telegramService.js';

export async function getLingkunganSummaryHandler(req, res) {
  const month = String(req.query.month || '').trim();
  const monthKey = /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : new Date().toISOString().slice(0, 7);
  await ensureLingkunganMembersFromWarga();
  const data = await getLingkunganSummary(monthKey);
  return res.json({ success: true, data: { month: monthKey, monthly_fee: data.active_fee || LINGKUNGAN_MONTHLY_FEE, ...data } });
}

export async function getLingkunganHistoryHandler(req, res) {
  const year = String(req.query.year || '').trim();
  if (!/^\d{4}$/.test(year)) return res.status(400).json({ success: false, message: 'year invalid' });
  const recap = await getLingkunganMonthlyRecapByYear(year);
  return res.json({ success: true, data: { year, recap } });
}

export async function getLingkunganTariffsHandler(_req, res) {
  const data = await listLingkunganTariffs();
  return res.json({ success: true, data });
}

export async function postLingkunganPaymentHandler(req, res) {
  const wargaId = String(req.body.warga_id || '').trim();
  const month = String(req.body.month || '').trim();
  const amount = Number(req.body.amount || 0);
  const paidAt = String(req.body.paid_at || '').trim();
  const note = String(req.body.note || '').trim();
  const actor = String(req.user.user_id || '').trim();
  if (!wargaId) return res.status(400).json({ success: false, message: 'warga_id wajib' });
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return res.status(400).json({ success: false, message: 'month invalid' });
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ success: false, message: 'amount invalid' });
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(paidAt)) return res.status(400).json({ success: false, message: 'paid_at invalid' });
  await addLingkunganPayment({ wargaId, month, amount, paidAt, note, createdBy: actor });
  await notifyUser(
    wargaId,
    `✅ <b>Iuran Lingkungan Tercatat</b>\n` +
      `Periode: <b>${month}</b>\n` +
      `Nominal: <b>${formatRupiah(amount)}</b>`
  );
  return res.json({ success: true });
}

export async function postLingkunganExpenseHandler(req, res) {
  const date = String(req.body.expense_date || '').trim();
  const amount = Number(req.body.amount || 0);
  const description = String(req.body.description || '').trim();
  const actor = String(req.user.user_id || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date)) return res.status(400).json({ success: false, message: 'expense_date invalid' });
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ success: false, message: 'amount invalid' });
  if (!description) return res.status(400).json({ success: false, message: 'description wajib' });
  await addLingkunganExpense({ date, amount, description, createdBy: actor });
  return res.json({ success: true });
}

export async function postLingkunganTariffHandler(req, res) {
  const effectiveMonth = String(req.body.effective_month || '').trim();
  const monthlyFee = Number(req.body.monthly_fee || 0);
  const actor = String(req.user.user_id || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(effectiveMonth)) return res.status(400).json({ success: false, message: 'effective_month invalid' });
  if (!Number.isFinite(monthlyFee) || monthlyFee <= 0) return res.status(400).json({ success: false, message: 'monthly_fee invalid' });
  await setLingkunganTariff({ effectiveMonth, monthlyFee, createdBy: actor });
  return res.json({ success: true });
}

export async function getLingkunganMembersHandler(_req, res) {
  const data = await listLingkunganMembers();
  return res.json({ success: true, data });
}

export async function postLingkunganMemberSetActiveHandler(req, res) {
  const wargaId = String(req.body.warga_id || '').trim();
  const isActive = Boolean(req.body.is_active);
  const activeFromMonth = String(req.body.active_from_month || '').trim();
  const actor = String(req.user.user_id || '').trim();
  if (!wargaId) return res.status(400).json({ success: false, message: 'warga_id wajib' });
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(activeFromMonth)) {
    return res.status(400).json({ success: false, message: 'active_from_month invalid' });
  }
  const data = await setLingkunganMemberActive({ wargaId, isActive, activeFromMonth, updatedBy: actor });
  return res.json({ success: true, data });
}

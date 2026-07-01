import {
  INTERNET_MONTHLY_FEE,
  addInternetExpense,
  addInternetPayment,
  ensureInternetMembersFromWarga,
  getInternetHistory,
  listInternetMembers,
  getInternetMonthlyRecapByYear,
  getInternetSummary,
  resetInternetMembersStartMonth,
  setInternetMemberActive,
  listInternetTariffs,
  setInternetTariff,
  updateInternetPayment
} from '../models/internetModel.js';
import { notifyUser } from '../services/approvalNotifier.js';
import { formatRupiah } from '../services/telegramService.js';

export async function getInternetSummaryHandler(req, res) {
  const month = String(req.query.month || '').trim();
  const monthKey = /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : new Date().toISOString().slice(0, 7);
  await ensureInternetMembersFromWarga();
  const data = await getInternetSummary(monthKey);
  return res.json({ success: true, data: { month: monthKey, monthly_fee: data.active_fee || INTERNET_MONTHLY_FEE, ...data } });
}

export async function postInternetPaymentHandler(req, res) {
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
  await addInternetPayment({ wargaId, month, amount, paidAt, note, createdBy: actor });
  await notifyUser(
    wargaId,
    `✅ <b>Iuran Internet Tercatat</b>\n` +
      `Periode: <b>${month}</b>\n` +
      `Nominal: <b>${formatRupiah(amount)}</b>`
  );
  return res.json({ success: true });
}

export async function patchInternetPaymentHandler(req, res) {
  const paymentId = String(req.body.payment_id || '').trim();
  const amount = Number(req.body.amount || 0);
  const paidAt = String(req.body.paid_at || '').trim();
  const note = String(req.body.note || '').trim();
  if (!paymentId) return res.status(400).json({ success: false, message: 'payment_id wajib' });
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ success: false, message: 'amount invalid' });
  if (paidAt && !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(paidAt)) return res.status(400).json({ success: false, message: 'paid_at invalid' });
  const data = await updateInternetPayment({ paymentId, amount, paidAt: paidAt || null, note });
  return res.json({ success: true, data });
}

export async function postInternetExpenseHandler(req, res) {
  const date = String(req.body.expense_date || '').trim();
  const amount = Number(req.body.amount || 0);
  const description = String(req.body.description || '').trim();
  const actor = String(req.user.user_id || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date)) return res.status(400).json({ success: false, message: 'expense_date invalid' });
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ success: false, message: 'amount invalid' });
  if (!description) return res.status(400).json({ success: false, message: 'description wajib' });
  await addInternetExpense({ date, amount, description, createdBy: actor });
  return res.json({ success: true });
}

export async function getInternetHistoryHandler(req, res) {
  const year = String(req.query.year || '').trim();
  if (/^\d{4}$/.test(year)) {
    const recap = await getInternetMonthlyRecapByYear(year);
    return res.json({ success: true, data: { year, recap } });
  }
  const month = String(req.query.month || '').trim();
  const monthKey = /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : new Date().toISOString().slice(0, 7);
  const data = await getInternetHistory(monthKey);
  return res.json({ success: true, data: { month: monthKey, ...data } });
}

export async function getInternetTariffsHandler(_req, res) {
  const data = await listInternetTariffs();
  return res.json({ success: true, data });
}

export async function postInternetTariffHandler(req, res) {
  const effectiveMonth = String(req.body.effective_month || '').trim();
  const monthlyFee = Number(req.body.monthly_fee || 0);
  const actor = String(req.user.user_id || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(effectiveMonth)) {
    return res.status(400).json({ success: false, message: 'effective_month invalid' });
  }
  if (!Number.isFinite(monthlyFee) || monthlyFee <= 0) {
    return res.status(400).json({ success: false, message: 'monthly_fee invalid' });
  }
  await setInternetTariff({ effectiveMonth, monthlyFee, createdBy: actor });
  return res.json({ success: true });
}

export async function getInternetMembersHandler(_req, res) {
  const data = await listInternetMembers();
  return res.json({ success: true, data });
}

export async function postInternetMemberSetActiveHandler(req, res) {
  const wargaId = String(req.body.warga_id || '').trim();
  const isActive = Boolean(req.body.is_active);
  const activeFromMonth = String(req.body.active_from_month || '').trim();
  const actor = String(req.user.user_id || '').trim();
  if (!wargaId) return res.status(400).json({ success: false, message: 'warga_id wajib' });
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(activeFromMonth)) return res.status(400).json({ success: false, message: 'active_from_month invalid' });
  const data = await setInternetMemberActive({ wargaId, isActive, activeFromMonth, updatedBy: actor });
  return res.json({ success: true, data });
}

export async function postInternetMembersResetStartMonthHandler(req, res) {
  const actor = String(req.user.user_id || '').trim();
  const data = await resetInternetMembersStartMonth({ activeFromMonth: '2026-01', updatedBy: actor });
  return res.json({ success: true, data });
}

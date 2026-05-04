import {
  activateKoperasiLoan,
  buildInstallmentPlan,
  createKoperasiLoanDraft,
  getKoperasiMemberCandidates,
  getKoperasiSummary,
  KOP_MAX_INTEREST_MONTHLY,
  recordKoperasiPayment,
  setKoperasiMemberActive
} from '../models/koperasiModel.js';

export async function koperasiMembersHandler(_req, res) {
  const data = await getKoperasiMemberCandidates();
  return res.json({ success: true, data });
}

export async function koperasiMemberSetActiveHandler(req, res) {
  const wargaId = String(req.body.warga_id || '').trim();
  const isActive = Boolean(req.body.is_active);
  if (!wargaId) return res.status(400).json({ success: false, message: 'warga_id wajib' });
  const data = await setKoperasiMemberActive({ wargaId, isActive });
  return res.json({ success: true, data });
}

export async function previewLoanPlanHandler(req, res) {
  const principal = Number(req.body.principal_amount || 0);
  const tenor = Number(req.body.tenor_months || 0);
  const model = String(req.body.interest_model || '').trim().toUpperCase();
  const rate = Number(req.body.interest_rate_monthly || 0);
  const firstDueMonth = String(req.body.first_due_month || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(firstDueMonth)) return res.status(400).json({ success: false, message: 'first_due_month invalid' });
  if (!['FLAT', 'DECLINING'].includes(model)) return res.status(400).json({ success: false, message: 'interest_model invalid' });
  if (!Number.isFinite(rate) || rate <= 0 || rate > KOP_MAX_INTEREST_MONTHLY) return res.status(400).json({ success: false, message: 'bunga max 2.5%/bulan' });
  const plan = buildInstallmentPlan({ principal, tenorMonths: tenor, interestModel: model, interestRateMonthly: rate, firstDueMonth });
  return res.json({ success: true, data: { plan } });
}

export async function createLoanDraftHandler(req, res) {
  const wargaId = String(req.body.warga_id || '').trim();
  const principal = Number(req.body.principal_amount || 0);
  const tenor = Number(req.body.tenor_months || 0);
  const model = String(req.body.interest_model || '').trim().toUpperCase();
  const rate = Number(req.body.interest_rate_monthly || 0);
  const notes = String(req.body.notes || '').trim();
  const actor = String(req.user.user_id || '').trim();
  if (!wargaId) return res.status(400).json({ success: false, message: 'warga_id wajib' });
  if (!['FLAT', 'DECLINING'].includes(model)) return res.status(400).json({ success: false, message: 'interest_model invalid' });
  if (!Number.isFinite(rate) || rate <= 0 || rate > KOP_MAX_INTEREST_MONTHLY) return res.status(400).json({ success: false, message: 'bunga max 2.5%/bulan' });
  const data = await createKoperasiLoanDraft({
    wargaId, principalAmount: principal, tenorMonths: tenor, interestModel: model, interestRateMonthly: rate, notes, createdBy: actor
  });
  return res.json({ success: true, data });
}

export async function activateLoanHandler(req, res) {
  const loanId = String(req.body.loan_id || '').trim();
  const firstDueMonth = String(req.body.first_due_month || '').trim();
  if (!loanId) return res.status(400).json({ success: false, message: 'loan_id wajib' });
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(firstDueMonth)) return res.status(400).json({ success: false, message: 'first_due_month invalid' });
  const data = await activateKoperasiLoan({ loanId, firstDueMonth, approvedBy: String(req.user.user_id || '').trim() });
  return res.json({ success: true, data });
}

export async function paymentLoanHandler(req, res) {
  const loanId = String(req.body.loan_id || '').trim();
  const amount = Number(req.body.amount || 0);
  const paidDate = String(req.body.paid_date || '').trim();
  const description = String(req.body.description || '').trim();
  if (!loanId) return res.status(400).json({ success: false, message: 'loan_id wajib' });
  if (!amount || amount <= 0) return res.status(400).json({ success: false, message: 'amount invalid' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidDate)) return res.status(400).json({ success: false, message: 'paid_date invalid' });
  const data = await recordKoperasiPayment({ loanId, amount, paidDate, description, createdBy: String(req.user.user_id || '').trim() });
  return res.json({ success: true, data });
}

export async function koperasiSummaryHandler(_req, res) {
  const data = await getKoperasiSummary();
  return res.json({ success: true, data });
}

import {
  catatPengeluaranBulanan,
  inputIuranWajibSetoran,
  listOpeningArrearsByContribution,
  listFinanceWallets,
  listIuranWajibTariffs,
  getActiveIuranWajibFeeByMonth,
  listIuranWajibStatusByMonth,
  listPendapatanBulanan,
  listPengeluaranBulanan,
  upsertIuranWajibTariff,
  upsertOpeningArrearsByContribution
} from '../models/bendaharaModel.js';
import {
  closeYearlyBook,
  getYearlyBookSummary,
  openYearlyBook
} from '../models/yearlyBookModel.js';
import { notifyRoles, notifyUser } from '../services/approvalNotifier.js';
import { formatRupiah } from '../services/telegramService.js';

export async function getBendaharaMasterData(req, res) {
  const month = String(req.query.month || '').trim();
  const monthParam = /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : null;
  try {
    const [wallets, pengeluaran, iuranStatus, pendapatan] = await Promise.all([
      listFinanceWallets(),
      listPengeluaranBulanan({ month: monthParam || undefined }),
      listIuranWajibStatusByMonth({ month: monthParam || undefined }),
      listPendapatanBulanan({ month: monthParam || undefined })
    ]);
    return res.json({ success: true, data: { wallets, pengeluaran, iuran_status: iuranStatus, pendapatan } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function getIuranWajibTariffs(req, res) {
  const month = String(req.query.month || '').trim();
  const monthParam = /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : null;
  try {
    const [tariffs, activeFee] = await Promise.all([
      listIuranWajibTariffs(),
      getActiveIuranWajibFeeByMonth(monthParam || undefined)
    ]);
    return res.json({ success: true, data: { tariffs, active_fee: activeFee } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function postIuranWajibTariff(req, res) {
  const effectiveMonth = String(req.body.effective_month || '').trim();
  const monthlyFee = Number(req.body.monthly_fee || 0);
  const actor = String(req.user.user_id || '').trim();

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(effectiveMonth)) {
    return res.status(400).json({ success: false, message: 'effective_month invalid' });
  }
  if (!Number.isFinite(monthlyFee) || monthlyFee <= 0) {
    return res.status(400).json({ success: false, message: 'monthly_fee harus > 0' });
  }

  try {
    await upsertIuranWajibTariff({ effectiveMonth, monthlyFee, createdBy: actor });
    const [tariffs, activeFee] = await Promise.all([
      listIuranWajibTariffs(),
      getActiveIuranWajibFeeByMonth(effectiveMonth)
    ]);
    return res.json({ success: true, data: { tariffs, active_fee: activeFee } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function getOpeningArrears(req, res) {
  const year = Number(req.query.year || new Date().getFullYear());
  const contribution = String(req.query.contribution || 'Iuran Wajib').trim();
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return res.status(400).json({ success: false, message: 'year tidak valid' });
  }
  try {
    const data = await listOpeningArrearsByContribution({ year, contributionName: contribution });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function saveOpeningArrears(req, res) {
  const year = Number(req.body.year || new Date().getFullYear());
  const contribution = String(req.body.contribution || 'Iuran Wajib').trim();
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return res.status(400).json({ success: false, message: 'year tidak valid' });
  }
  try {
    await upsertOpeningArrearsByContribution({ year, contributionName: contribution, items });
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function setorIuranWajibWarga(req, res) {
  const wargaId = String(req.body.warga_id || '').trim();
  const amount = Number(req.body.amount || 0);
  const rawTanggal = req.body.tanggal ? String(req.body.tanggal).trim() : '';
  const tanggal = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(rawTanggal)
    ? rawTanggal
    : null;
  const tanggalNotif = tanggal || new Date().toISOString().slice(0, 10);
  const actor = String(req.user.user_id || '').trim();

  if (!wargaId) return res.status(400).json({ success: false, message: 'warga_id tidak valid' });
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ success: false, message: 'amount harus lebih dari 0' });
  }

  try {
    await inputIuranWajibSetoran({ wargaId, amount, createdBy: actor, tanggal });
    await notifyUser(
      wargaId,
      `✅ <b>Iuran Wajib Tercatat</b>\n` +
        `Nominal: <b>${formatRupiah(amount)}</b>\n` +
        `Tanggal: <b>${tanggalNotif}</b>`
    );
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function inputPengeluaranBulanan(req, res) {
  const walletId = String(req.body.wallet_id || '').trim();
  const amount = Number(req.body.amount || 0);
  const description = String(req.body.description || '').trim();
  const tanggalKeluarRaw = String(req.body.tanggal_keluar || '').trim();
  const tanggalKeluar = tanggalKeluarRaw || null;
  const actor = String(req.user.user_id || '').trim();

  if (!walletId) {
    return res.status(400).json({ success: false, message: 'wallet_id tidak valid' });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ success: false, message: 'amount harus lebih dari 0' });
  }
  if (!description) {
    return res.status(400).json({ success: false, message: 'description wajib diisi' });
  }
  if (!tanggalKeluar || !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(tanggalKeluar)) {
    return res.status(400).json({ success: false, message: 'tanggal_keluar wajib format YYYY-MM-DD' });
  }

  try {
    await catatPengeluaranBulanan({
      walletId,
      amount,
      description,
      createdBy: actor,
      tanggalKeluar
    });
    await notifyRoles(
      ['Ketua', 'Sekretaris'],
      `🔔 <b>Approval Pengeluaran Bendahara Dibutuhkan</b>\n` +
        `Nominal: <b>${formatRupiah(amount)}</b>\n` +
        `Keterangan: <b>${description}</b>\n` +
        `Tanggal Keluar: <b>${tanggalKeluar}</b>`
    );
    const pengeluaran = await listPengeluaranBulanan();
    return res.json({ success: true, message: 'Pengeluaran diajukan dan menunggu approval Ketua/Sekretaris', data: { pengeluaran } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function getYearlyBook(req, res) {
  const nowYear = new Date().getFullYear();
  const rawYear = Number(req.query.year || nowYear);
  const year = Number.isInteger(rawYear) ? rawYear : nowYear;
  if (year < 2000 || year > 2100) {
    return res.status(400).json({ success: false, message: 'year tidak valid' });
  }

  try {
    const data = await getYearlyBookSummary(year);
    return res.json({ success: true, data: { year, ...data } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function closeBookYear(req, res) {
  const year = Number(req.body.year || 0);
  const actor = String(req.user.user_id || '').trim();
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return res.status(400).json({ success: false, message: 'year tidak valid' });
  }
  if (!actor) {
    return res.status(401).json({ success: false, message: 'User tidak valid' });
  }

  try {
    await closeYearlyBook({ year, actor });
    const data = await getYearlyBookSummary(year);
    return res.json({ success: true, data: { year, ...data } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function openBookYear(req, res) {
  const year = Number(req.body.year || 0);
  const actor = String(req.user.user_id || '').trim();
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return res.status(400).json({ success: false, message: 'year tidak valid' });
  }
  if (!actor) {
    return res.status(401).json({ success: false, message: 'User tidak valid' });
  }

  try {
    await openYearlyBook({ year, actor });
    const data = await getYearlyBookSummary(year);
    return res.json({ success: true, data: { year, ...data } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

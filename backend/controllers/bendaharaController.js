import {
  catatPengeluaranBulanan,
  inputIuranWajibSetoran,
  listFinanceWallets,
  listPengeluaranBulanan
} from '../models/bendaharaModel.js';
import {
  closeYearlyBook,
  getYearlyBookSummary,
  openYearlyBook
} from '../models/yearlyBookModel.js';

export async function getBendaharaMasterData(req, res) {
  const month = String(req.query.month || '').trim();
  const monthParam = /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : null;
  try {
    const [wallets, pengeluaran] = await Promise.all([
      listFinanceWallets(),
      listPengeluaranBulanan({ month: monthParam || undefined })
    ]);
    return res.json({ success: true, data: { wallets, pengeluaran } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function setorIuranWajibWarga(req, res) {
  const wargaId = String(req.body.warga_id || '').trim();
  const amount = Number(req.body.amount || 0);
  const tanggal = req.body.tanggal ? String(req.body.tanggal) : null;
  const actor = String(req.user.user_id || '').trim();

  if (!wargaId) return res.status(400).json({ success: false, message: 'warga_id tidak valid' });
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ success: false, message: 'amount harus lebih dari 0' });
  }

  try {
    await inputIuranWajibSetoran({ wargaId, amount, createdBy: actor, tanggal });
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function inputPengeluaranBulanan(req, res) {
  const walletId = Number(req.body.wallet_id || 0);
  const amount = Number(req.body.amount || 0);
  const description = String(req.body.description || '').trim();
  const tanggalKeluarRaw = String(req.body.tanggal_keluar || '').trim();
  const tanggalKeluar = tanggalKeluarRaw || null;
  const actor = String(req.user.user_id || '').trim();

  if (!Number.isInteger(walletId) || walletId <= 0) {
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
    const pengeluaran = await listPengeluaranBulanan();
    return res.json({ success: true, data: { pengeluaran } });
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

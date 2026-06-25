import {
  closeTabunganYear,
  createTabunganEvent,
  getTabunganYearlyBook,
  getTabunganCashSummary,
  getTabunganEventDetail,
  getTabunganMinimumFee,
  inputTabunganSetoran,
  listTabunganMembers,
  listTabunganTariffs,
  listTabunganLedgerByMonth,
  listTabunganWargaSummary,
  openTabunganYear,
  setTabunganMemberActive,
  setTabunganTariff
} from '../models/tabunganModel.js';

export async function getTabunganSummary(_req, res) {
  try {
    const month = new Date().toISOString().slice(0, 7);
    const [data, minimumFee, cashSummary] = await Promise.all([
      listTabunganWargaSummary(),
      getTabunganMinimumFee(month),
      getTabunganCashSummary()
    ]);
    const totalSaldoWarga = data.reduce((sum, row) => sum + Number(row.total_balance || 0), 0);
    const sisaKasKegiatan = Number(cashSummary.sisa_kas_kegiatan || 0);
    return res.json({
      success: true,
      data,
      minimum_fee: minimumFee,
      total_saldo_warga: totalSaldoWarga,
      sisa_kas_kegiatan: sisaKasKegiatan,
      total_kas_dana: totalSaldoWarga + sisaKasKegiatan
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function inputTabunganWarga(req, res) {
  const wargaId = String(req.body.warga_id || '').trim();
  const amount = Number(req.body.amount || 0);
  const description = String(req.body.description || '').trim();
  const actor = String(req.user.user_id || '').trim();

  if (!wargaId) return res.status(400).json({ success: false, message: 'warga_id tidak valid' });
  const minimumFee = await getTabunganMinimumFee(new Date().toISOString().slice(0, 7));
  if (!Number.isFinite(amount) || amount < minimumFee) {
    return res.status(400).json({ success: false, message: `amount minimal ${minimumFee}` });
  }
  if (!description) {
    return res.status(400).json({ success: false, message: 'description wajib diisi' });
  }

  try {
    await inputTabunganSetoran({ wargaId, amount, description, createdBy: actor });
    return res.json({ success: true, message: 'Setoran tabungan berhasil dicatat' });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function getTabunganMembersHandler(_req, res) {
  try {
    return res.json({ success: true, data: await listTabunganMembers() });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function postTabunganMemberSetActiveHandler(req, res) {
  const wargaId = String(req.body.warga_id || '').trim();
  const isActive = Boolean(req.body.is_active);
  const actor = String(req.user.user_id || '').trim();
  if (!wargaId) return res.status(400).json({ success: false, message: 'warga_id wajib diisi' });
  try {
    return res.json({ success: true, data: await setTabunganMemberActive({ wargaId, isActive, updatedBy: actor }) });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function getTabunganTariffsHandler(_req, res) {
  try {
    return res.json({ success: true, data: await listTabunganTariffs() });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function postTabunganTariffHandler(req, res) {
  const effectiveMonth = String(req.body.effective_month || '').trim();
  const monthlyFee = Number(req.body.monthly_fee || 0);
  const actor = String(req.user.user_id || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(effectiveMonth)) return res.status(400).json({ success: false, message: 'effective_month tidak valid' });
  if (!Number.isFinite(monthlyFee) || monthlyFee <= 0) return res.status(400).json({ success: false, message: 'monthly_fee harus lebih dari 0' });
  try {
    await setTabunganTariff({ effectiveMonth, monthlyFee, createdBy: actor });
    return res.json({ success: true, data: await listTabunganTariffs() });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function createKebutuhanKhusus(req, res) {
  const title = String(req.body.title || '').trim();
  const eventDate = String(req.body.event_date || '').trim();
  const totalAmount = Number(req.body.total_amount || 0);
  const perWargaAmount = Number(req.body.per_warga_amount || 0);
  const notes = String(req.body.notes || '').trim();
  const actor = String(req.user.user_id || '').trim();

  if (!title) return res.status(400).json({ success: false, message: 'title wajib diisi' });
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(eventDate)) {
    return res.status(400).json({ success: false, message: 'event_date wajib format YYYY-MM-DD' });
  }
  if (!Number.isFinite(totalAmount) || totalAmount < 5000) {
    return res.status(400).json({ success: false, message: 'total_amount minimal 5000' });
  }
  if (!Number.isFinite(perWargaAmount) || perWargaAmount <= 0) {
    return res.status(400).json({ success: false, message: 'per_warga_amount wajib lebih dari 0' });
  }

  try {
    const data = await createTabunganEvent({ title, eventDate, totalAmount, perWargaAmount, notes, createdBy: actor });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function getKebutuhanKhususDetail(req, res) {
  const eventId = String(req.query.event_id || '').trim();
  if (!eventId) return res.status(400).json({ success: false, message: 'event_id wajib diisi' });

  try {
    const data = await getTabunganEventDetail(eventId);
    if (!data) return res.status(404).json({ success: false, message: 'Event tidak ditemukan' });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function getTabunganHistory(req, res) {
  const month = String(req.query.month || '').trim();
  const monthParam = /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : null;
  try {
    const data = await listTabunganLedgerByMonth({ month: monthParam || undefined });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function getTabunganYearlyBookHandler(req, res) {
  const rawYear = Number(req.query.year || new Date().getFullYear());
  const year = Number.isInteger(rawYear) ? rawYear : new Date().getFullYear();
  if (year < 2000 || year > 2100) {
    return res.status(400).json({ success: false, message: 'year tidak valid' });
  }
  try {
    const data = await getTabunganYearlyBook(year);
    return res.json({ success: true, data: { year, rows: data } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function closeTabunganYearHandler(req, res) {
  const year = Number(req.body.year || 0);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return res.status(400).json({ success: false, message: 'year tidak valid' });
  }
  try {
    await closeTabunganYear({ year });
    const data = await getTabunganYearlyBook(year);
    return res.json({ success: true, data: { year, rows: data } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function openTabunganYearHandler(req, res) {
  const year = Number(req.body.year || 0);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return res.status(400).json({ success: false, message: 'year tidak valid' });
  }
  try {
    await openTabunganYear({ year });
    const data = await getTabunganYearlyBook(year);
    return res.json({ success: true, data: { year, rows: data } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}
